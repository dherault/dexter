const { ethers } = require('ethers')

const zeroAddress = '0x0000000000000000000000000000000000000000'

class Dexters {

  constructor(chainId, { log = console.log } = {}) {
    this.chainId = chainId
    this.chainMetadata = require(`ultimate-token-list/data/blockchains/${chainId}/metadata.json`)

    this.log = log

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
      this.dexIdToDex[dexId] = new Dex(this, chainId, dexId, { log })
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

  constructor(dexters, chainId, dexId, { log = console.log } = {}) {
    this.chainId = chainId
    this.dexId = dexId
    this.dexters = dexters

    this.log = log

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
    this.pairAddressToUnlistener = {}
  }

  getPairContract(pairAddress) {
    if (this.pairAddressToContract[pairAddress]) {
      return this.pairAddressToContract[pairAddress]
    }

    const pairContractMetadata = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.pair]

    return this.pairAddressToContract[pairAddress] = new ethers.Contract(pairAddress, pairContractMetadata.abi, this.dexters.provider)
  }

  async getPairAddress(tokenAdress0, tokenAdress1) {
    return this.pairFactoryContract.getPair(tokenAdress0, tokenAdress1)
  }

  async getAllPairAddresses() {
    const pairAddressesPromises = []
    const tokenAddresses = Object.keys(this.tokenAddressToTokenMetadata)

    for (let i = 0; i < tokenAddresses.length; i++) {
      const tokenAddress0 = tokenAddresses[i]

      for (let j = i + 1; j < tokenAddresses.length; j++) {
        const tokenAddress1 = tokenAddresses[j]

        pairAddressesPromises.push(this.getPairAddress(tokenAddress0, tokenAddress1))
      }
    }

    return (await Promise.all(pairAddressesPromises))
    .filter(pairAddress => pairAddress !== zeroAddress)
  }

  async getPairReserves(pairAddress) {
    const pairContract = this.getPairContract(pairAddress)

    const token0 = await pairContract.token0()
    const token1 = await pairContract.token1()
    const { _reserve0, _reserve1 } = await pairContract.getReserves()

    return {
      [token0]: _reserve0,
      [token1]: _reserve1,
    }
  }

  async getTokenPrice(tokenAddress) {
    const { wrappedNativeTokenAddress } = this.dexters.chainMetadata

    if (!wrappedNativeTokenAddress) {
      throw new Error(`Unsupported chainId: ${this.chainId}`)
    }

    const entries = Object.entries(this.stablecoinAddressToStablecoinMetadata)
    const pairReservesPromises = entries.map(([stablecoinAddress]) => (
      this.getPairAddress(wrappedNativeTokenAddress, stablecoinAddress)
      .then(pairAddress => this.getPairReserves(pairAddress))
    ))

    const pairsReserves = await Promise.all(pairReservesPromises)

    const weightedSum = ethers.BigNumber.from(0)
    let totalLiquidity = ethers.BigNumber.from(0)

    for (let i = 0; i < entries.length; i++) {
      const [stablecoinAddress] = entries[i]
      const { [stablecoinAddress]: reserve } = pairsReserves[i] // 0 or  1 ?

      totalLiquidity = totalLiquidity.plus(reserve)
    }
  }

  getToken(symbolOrAddress) {
    return this.tokenSymbolToTokenMetadata[symbolOrAddress] || this.tokenAddressToTokenMetadata[symbolOrAddress]
  }

  listenToPair(pairAddress, callback = () => null) {
    if (this.pairAddressToUnlistener[pairAddress]) {
      return this.pairAddressToUnlistener[pairAddress]
    }

    this.log('Listening to', pairAddress)

    const pairContract = this.getPairContract(pairAddress)
    const listener = (reserve0, reserve1, event) => {
      // The event object contains the verbatim log data, the
      // EventFragment and functions to fetch the block,
      // transaction and receipt and event functions
      this.log('reserve0', reserve0)
      this.log('reserve1', reserve1)
      this.log('event', event)
    }

    pairContract.on('Sync', listener)

    return this.pairAddressToUnlistener[pairAddress] = () => pairContract.off('Sync', listener)
  }

}

module.exports = Dexters
