const { ethers } = require('ethers')
const BigNumber = require('bignumber.js')

const zeroAddress = '0x0000000000000000000000000000000000000000'
const K = new BigNumber(10 ** 12)

class Dexters {

  constructor(chainId) {
    this.chainId = chainId
    this.chainMetadata = require(`ultimate-token-list/data/blockchains/${chainId}/metadata.json`)

    if (!this.chainMetadata) {
      throw new Error(`Unsupported chainId: ${chainId}`)
    }

    this.provider = new ethers.providers.JsonRpcProvider(this.chainMetadata.rpc[0])

    this.tokenAddressToTokenMetadata = require(`ultimate-token-list/data/blockchains/${chainId}/tokens.json`)
    this.stablecoinAddressToStablecoinMetadata = require(`ultimate-token-list/data/blockchains/${chainId}/stablecoins.json`)
    this.tokenSymbolToTokenMetadata = {}

    Object.values(this.tokenAddressToTokenMetadata).forEach(tokenInfo => {
      this.tokenSymbolToTokenMetadata[tokenInfo.symbol] = tokenInfo
    })

    this.dexIdToDex = {}

    this.getDexIds().forEach(dexId => {
      this.dexIdToDex[dexId] = new Dex(this, chainId, dexId,)
    })
  }

  getDexIds() {
    return this.chainMetadata.dexes
  }

  getDex(id) {
    return this.dexIdToDex[id]
  }

  getToken(symbolOrAddress) {
    return this.tokenSymbolToTokenMetadata[symbolOrAddress] || this.tokenAddressToTokenMetadata[symbolOrAddress]
  }

  getCrossTokens(dexId0, dexId1) {
    const dex0 = this.getDex(dexId0)
    const dex1 = this.getDex(dexId1)
    const tokensAddresses0 = new Set(Object.keys(dex0.tokenAddressToTokenMetadata))
    const tokensAddresses1 = new Set(Object.keys(dex1.tokenAddressToTokenMetadata))

    const commonTokenAddresses = new Set([...tokensAddresses0].filter(x => tokensAddresses1.has(x)))

    const tokenAddressTokenMetadata = {}

    commonTokenAddresses.forEach(tokenAddress => {
      tokenAddressTokenMetadata[tokenAddress] = dex0.tokenAddressToTokenMetadata[tokenAddress]
    })

    return tokenAddressTokenMetadata
  }

}

class Dex {

  constructor(dexters, chainId, dexId) {
    this.chainId = chainId
    this.dexId = dexId
    this.dexters = dexters

    this.metadata = require(`ultimate-token-list/data/dexes/${dexId}/metadata.json`)
    this.contractNameToContractMetadata = require(`ultimate-token-list/data/dexes/${dexId}/contracts/${chainId}.json`)

    const pairFactoryContractMetadata = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.factory]

    this.pairFactoryContract = new ethers.Contract(pairFactoryContractMetadata.address, pairFactoryContractMetadata.abi, this.dexters.provider)

    this.stablecoinAddressToStablecoinMetadata = require(`ultimate-token-list/data/dexes/${dexId}/stablecoins/${chainId}.json`)
    this.tokenAddressToTokenMetadata = require(`ultimate-token-list/data/dexes/${dexId}/tokens/${chainId}.json`)
    this.tokenSymbolToTokenMetadata = {}

    Object.values(this.tokenAddressToTokenMetadata).forEach(tokenInfo => {
      this.tokenSymbolToTokenMetadata[tokenInfo.symbol] = tokenInfo
    })

    this.pairAddressToContract = {}
    this.pairAddressToListenerToUnlistener = {}
    this.pairAddressToTokenAddresses = {}
    this.tokenAddress0ToTokenAddress1ToPairAddress = {}
    this.pairAddressToPriceData = {}

    this.unlistenToWrappedNativePriceUpdates = () => null
    this.wrappedNativePriceInUsd = null
    this.wrappedNativePriceInUsdTimestamp = null
  }

  /* ---
    TOKENS
  --- */

  getToken(symbolOrAddress) {
    return this.tokenSymbolToTokenMetadata[symbolOrAddress] || this.tokenAddressToTokenMetadata[symbolOrAddress]
  }

  /* ---
    PAIRS
  --- */

  registerPair(tokenAddress0, tokenAddress1, pairAddress) {
    this.pairAddressToTokenAddresses[pairAddress] = [tokenAddress0, tokenAddress1]

    if (!this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0]) {
      this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0] = {}
    }

    if (!this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress1]) {
      this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress1] = {}
    }

    this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0][tokenAddress1] = pairAddress
    this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress1][tokenAddress0] = pairAddress
  }

  getPairTokenAddresses(pairAddress) {
    return this.pairAddressToTokenAddresses[pairAddress] || []
  }

  async getPairAddress(tokenAddress0, tokenAddress1) {
    if (this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0] && this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0][tokenAddress1]) {
      return this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0][tokenAddress1]
    }

    const pairAddress = await this.pairFactoryContract.getPair(tokenAddress0, tokenAddress1)

    this.registerPair(tokenAddress0, tokenAddress1, pairAddress)

    return pairAddress
  }

  async getAllPairAddresses() {
    const pairAddressesPromises = []
    const tokenAddresses = Object.keys(this.tokenAddressToTokenMetadata)

    for (let i = 0; i < tokenAddresses.length; i++) {
      const tokenAddress0 = tokenAddresses[i]

      for (let j = i + 1; j < tokenAddresses.length; j++) {
        const tokenAddress1 = tokenAddresses[j]

        if (this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0] && this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0][tokenAddress1]) {
          pairAddressesPromises.push(this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0][tokenAddress1])
        }
        else {
          pairAddressesPromises.push(
            this.getPairAddress(tokenAddress0, tokenAddress1)
            .then(pairAddress => {
              this.registerPair(tokenAddress0, tokenAddress1, pairAddress)

              return pairAddress
            })
          )
        }
      }
    }

    return (await Promise.all(pairAddressesPromises))
    .filter(pairAddress => pairAddress !== zeroAddress)
  }

  async getPairTokenAddressesFromContract(pairAddress) {
    const pairContract = this.getPairContract(pairAddress)

    const [
      token0,
      token1,
    ] = await Promise.all([
      pairContract.token0(),
      pairContract.token1(),
    ])

    return { token0, token1 }
  }

  async getPairReserves(pairAddress) {
    const pairContract = this.getPairContract(pairAddress)

    const [
      { token0, token1 },
      { _reserve0, _reserve1 },
    ] = await Promise.all([
      this.getPairTokenAddressesFromContract(pairAddress),
      pairContract.getReserves(),
    ])

    return {
      [token0]: new BigNumber(_reserve0.toString()),
      [token1]: new BigNumber(_reserve1.toString()),
    }
  }

  async getPairCumulativePrices(pairAddress) {
    const pairContract = this.getPairContract(pairAddress)

    const [
      { token0, token1 },
      priceCumulative0,
      priceCumulative1,
    ] = await Promise.all([
      this.getPairTokenAddressesFromContract(pairAddress),
      pairContract.price0CumulativeLast(),
      pairContract.price1CumulativeLast(),
    ])

    return {
      [token0]: new BigNumber(priceCumulative0.toString()),
      [token1]: new BigNumber(priceCumulative1.toString()),
    }
  }

  /* ---
    CONTRACTS
  --- */

  getPairContract(pairAddress) {
    if (this.pairAddressToContract[pairAddress]) {
      return this.pairAddressToContract[pairAddress]
    }

    const pairContractMetadata = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.pair]

    return this.pairAddressToContract[pairAddress] = new ethers.Contract(pairAddress, pairContractMetadata.abi, this.dexters.provider)
  }

  /* ---
    ORACLE
  --- */

  async addPriceListener(tokenAddress, callback) {
    const stablecoinAddresses = Object.keys(this.stablecoinAddressToStablecoinMetadata)
    const stablecoinPairAddresses = await Promise.all(stablecoinAddresses.map(stablecoinAddress => this.getPairAddress(tokenAddress, stablecoinAddress)))
    const workingStablecoinPairAddresses = stablecoinPairAddresses.filter(pairAddress => pairAddress !== zeroAddress)

    if (workingStablecoinPairAddresses.length === 0) {
      console.warn(`[Dexters] ${this.chainId} ${this.dexId}: no working stablecoin pairs found for token ${tokenAddress}`)

      // Return mock unlistener
      return () => null
    }

    const oracle = this.createOracle(tokenAddress, callback)

    const unlisteners = workingStablecoinPairAddresses.map(pairAddress => (
      this.addPairListener(pairAddress, syncEventData => oracle(pairAddress, syncEventData))
    ))

    // Return compound unlistener
    return () => unlisteners.forEach(unlistener => unlistener())
  }

  addPairListener(pairAddress, callback) {
    if (!this.pairAddressToListenerToUnlistener[pairAddress]) {
      this.pairAddressToListenerToUnlistener[pairAddress] = new Map()
    }

    if (this.pairAddressToListenerToUnlistener[pairAddress].has(callback)) {
      return this.pairAddressToListenerToUnlistener[pairAddress].get(callback)
    }

    const pairContract = this.getPairContract(pairAddress)

    const listener = async (reserve0, reserve1, event) => {
      const data = await this.processSyncEvent(pairAddress, event, reserve0, reserve1)

      if (data) callback(data)
    }

    pairContract.on('Sync', listener)

    const unlistener = () => pairContract.off('Sync', listener)

    this.pairAddressToListenerToUnlistener[pairAddress].set(callback, unlistener)

    return unlistener
  }

  async processSyncEvent(pairAddress, event, xReserve0, xReserve1) {
    console.log('sync event')
    const [tokenAddress0, tokenAddress1] = this.getPairTokenAddresses(pairAddress)

    if (!(tokenAddress0 && tokenAddress1)) return null

    const [
      {
        timestamp,
      },
      {
        [tokenAddress0]: priceCumulative0,
        [tokenAddress1]: priceCumulative1,
      },
    ] = await Promise.all([
      event.getBlock(),
      this.getPairCumulativePrices(pairAddress),
    ])

    if (!this.pairAddressToPriceData[pairAddress]) {
      this.pairAddressToPriceData[pairAddress] = []
    }

    const reserve0 = new BigNumber(xReserve0.toString())
    const reserve1 = new BigNumber(xReserve1.toString())
    const lastDataPoint = this.pairAddressToPriceData[pairAddress][this.pairAddressToPriceData[pairAddress].length - 1]

    this.pairAddressToPriceData[pairAddress].push({
      timestamp,
      reserve0,
      reserve1,
      priceCumulative0,
      priceCumulative1,
    })

    if (!lastDataPoint || timestamp === lastDataPoint.timestamp) return null

    return {
      timestamp,
      [tokenAddress0]: {
        reserve: reserve0,
        timeWeightedAveragePrice: (priceCumulative0.minus(lastDataPoint.priceCumulative0)).div(timestamp - lastDataPoint.timestamp),
      },
      [tokenAddress1]: {
        reserve: reserve1,
        timeWeightedAveragePrice: (priceCumulative1.minus(lastDataPoint.priceCumulative1)).div(timestamp - lastDataPoint.timestamp),
      },
    }
  }

  createOracle(tokenAddress, callback) {
    const pairAddressToSyncEventData = {}

    return async (pairAddress, syncEventData) => {
      pairAddressToSyncEventData[pairAddress] = syncEventData

      const [tokenAddress0, tokenAddress1] = this.getPairTokenAddresses(pairAddress)
      const isToken0 = tokenAddress0 === tokenAddress
      const stablecoinSymbol = (isToken0 ? this.getToken(tokenAddress1) : this.getToken(tokenAddress0)).symbol

      // HACK
      if (stablecoinSymbol === 'BUSD') return

      const {
        timestamp,
        [tokenAddress0]: { reserve: reserve0, timeWeightedAveragePrice: timeWeightedAveragePrice0 },
        [tokenAddress1]: { reserve: reserve1, timeWeightedAveragePrice: timeWeightedAveragePrice1 },
      } = syncEventData

      /*
        x0 = p1 * r0
        x1 = p0 * r1
        P / K = x1 / x0 = (p0 * r1) / (p1 * r0)
      */
      let price

      if (isToken0 && timeWeightedAveragePrice1.gt(0) && reserve0.gt(0)) {
        price = K.times(timeWeightedAveragePrice0).times(reserve1).div(timeWeightedAveragePrice1).div(reserve0)
      }
      if (!isToken0 && timeWeightedAveragePrice0.gt(0) && reserve1.gt(0)) {
        price = K.times(timeWeightedAveragePrice1).times(reserve0).div(timeWeightedAveragePrice0).div(reserve1)
      }

      if (!price) return

      console.log('stablecoin inverse', stablecoinSymbol, price.toString())

      callback({
        timestamp,
        price,
      })
    }
  }

  /* ---
    LIFECYCLE
  --- */

  async startListeningToWrappedNativePriceUpdates() {
    const { wrappedNativeTokenAddress } = this.dexters.chainMetadata

    if (!wrappedNativeTokenAddress) {
      throw new Error(`[Dexters] ${this.dexters.chainId} ${this.dexId} wrappedNativeTokenAddress not set for this blockchain`)
    }

    const wrappedNativeTokenSymbol = this.getToken(wrappedNativeTokenAddress).symbol

    console.log('Listening to wrapped native price updates', wrappedNativeTokenSymbol, wrappedNativeTokenAddress)

    this.unlistenToWrappedNativePriceUpdates = await this.addPriceListener(wrappedNativeTokenAddress, ({ timestamp, price }) => {
      console.log('wrapped native price update', wrappedNativeTokenSymbol, price.toString())
      this.wrappedNativePriceInUsd = price
      this.wrappedNativePriceInUsdTimestamp = timestamp
    })
  }

  stopListeningToWrappedNativePriceUpdates() {
    this.unlistenToWrappedNativePriceUpdates()
  }
}

module.exports = Dexters
