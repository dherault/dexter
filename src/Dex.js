const { ethers } = require('ethers')
const BigNumber = require('bignumber.js')

const zeroAddress = '0x0000000000000000000000000000000000000000'

class Dex {

  constructor(dexters, chainId, dexId) {
    this.chainId = chainId
    this.dexId = dexId
    this.dexters = dexters

    this.metadata = require(`blockchain-datasets/data/dexes/${dexId}/metadata.json`)
    this.contractNameToContractMetadata = require(`blockchain-datasets/data/dexes/${dexId}/contracts/${chainId}.json`)

    this.stablecoinAddressToMetadata = require(`blockchain-datasets/data/dexes/${dexId}/stablecoins/${chainId}.json`)
    this.tokenAddressToMetadata = require(`blockchain-datasets/data/dexes/${dexId}/tokens/${chainId}.json`)
    this.tokenSymbolToMetadata = {}

    Object.values(this.tokenAddressToMetadata).forEach(tokenInfo => {
      this.tokenSymbolToMetadata[tokenInfo.symbol] = tokenInfo
    })

    // Contracts
    this.routerContract = null
    this.factoryContract = null
    this.pairAddressToContract = {}

    // Pair
    this.pairAddressToListenerToUnlistener = {}
    this.pairAddressToTokenAddresses = {}
    this.tokenAddress0ToTokenAddress1ToPairAddress = {}
  }

  /* ---
    TOKENS
  --- */

  getToken(symbolOrAddress) {
    return this.tokenSymbolToMetadata[symbolOrAddress] || this.tokenAddressToMetadata[symbolOrAddress]
  }

  /* ---
    CONTRACTS
  --- */

  getRouterContract() {
    if (this.routerContract) {
      return this.routerContract
    }

    const routerContractMetadata = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.factory]

    return this.routerContract = new ethers.Contract(routerContractMetadata.address, routerContractMetadata.abi, this.dexters.provider)
  }

  getFactoryContract() {
    if (this.factoryContract) {
      return this.factoryContract
    }

    const factoryContractMetadata = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.factory]

    return this.factoryContract = new ethers.Contract(factoryContractMetadata.address, factoryContractMetadata.abi, this.dexters.provider)
  }

  getPairContract(pairAddress) {
    if (this.pairAddressToContract[pairAddress]) {
      return this.pairAddressToContract[pairAddress]
    }

    const pairContractMetadata = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.pair]

    return this.pairAddressToContract[pairAddress] = new ethers.Contract(pairAddress, pairContractMetadata.abi, this.dexters.provider)
  }

  /* ---
    PAIR ADDRESS
  --- */

  async getPairAddresses(pairAddress) {
    if (this.pairAddressToTokenAddresses[pairAddress]) {
      return this.pairAddressToTokenAddresses[pairAddress]
    }

    const pairContract = this.getPairContract(pairAddress)

    const [
      tokenAddress0,
      tokenAddress1,
    ] = await Promise.all([
      pairContract.token0(),
      pairContract.token1(),
    ])

    this._registerPair(pairAddress, tokenAddress0, tokenAddress1)

    return [tokenAddress0, tokenAddress1]
  }

  async getPairAddress(tokenAddress0, tokenAddress1) {
    if (this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0] && this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0][tokenAddress1]) {
      return this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0][tokenAddress1]
    }

    const pairAddress = await this.getFactoryContract().getPair(tokenAddress0, tokenAddress1)

    this._registerPair(pairAddress, tokenAddress0, tokenAddress1)

    return pairAddress
  }

  /* ---
    PAIR GETTERS
  --- */

  async getPairs() {
    if (this.metadata.contractTypeToContractName.factory === 'UniswapV2Factory') {
      console.log(`[Dexters|${this.chainId}|${this.dexId}] Getting all pairs on UniswapV2Factory, this could take a while...`)

      const factoryContract = this.getFactoryContract()
      const nPairsBigNumber = await factoryContract.allPairsLength()
      const nPairs = new BigNumber(nPairsBigNumber.toString()).toNumber()
      const pairs = {}
      const increment = 64

      for (let i = 0; i < nPairs; i += increment) {
        console.log(`[Dexters|${this.chainId}|${this.dexId}] Getting all pairs on UniswapV2Factory, ${i}/${nPairs}`)

        const promises = []

        for (let j = 0; j < increment; j++) {
          if (i + j < nPairs) {
            promises.push(
              factoryContract.allPairs(i + j)
              .then(pairAddress => (
                this.getPairAddresses(pairAddress)
                .then(tokenAddresses => ({
                  [pairAddress]: tokenAddresses,
                }))
              ))
            )
          }
        }

        Object.assign(pairs, ...(await Promise.all(promises)))
      }

      return pairs
    }

    throw new Error(`Unimplemented factory: ${this.metadata.contractTypeToContractName.factory}`)
  }

  async getPairReserves(pairAddress) {
    const pairContract = this.getPairContract(pairAddress)

    const [
      [tokenAddress0, tokenAddress1],
      { _reserve0, _reserve1 },
    ] = await Promise.all([
      this.getPairAddresses(pairAddress),
      pairContract.getReserves(),
    ])

    return {
      [tokenAddress0]: new BigNumber(_reserve0.toString()),
      [tokenAddress1]: new BigNumber(_reserve1.toString()),
    }
  }

  /* ---
    ORACLE
  --- */

  async addOracleListener(tokenAddress0OrPairAddress, tokenAddress1OrCallback, callback) {
    if (typeof tokenAddress1OrCallback === 'function') {
      return this.addPairListener(tokenAddress0OrPairAddress, syncEventData => this.oracle(tokenAddress0OrPairAddress, syncEventData, tokenAddress1OrCallback))
    }

    const pairAddress = await this.getPairAddress(tokenAddress0OrPairAddress, tokenAddress1OrCallback)

    return this.addPairListener(pairAddress, syncEventData => this.oracle(pairAddress, syncEventData, callback))
  }

  async addStablecoinsOracleListener(callback) {
    const { wrappedNativeTokenAddress } = this.dexters.chainMetadata

    if (!wrappedNativeTokenAddress) {
      throw new Error(`[Dexters|${this.dexters.chainId}|${this.dexId}] wrappedNativeTokenAddress not set for this blockchain`)
    }

    const stablecoinAddresses = Object.keys(this.stablecoinAddressToMetadata)
    const stablecoinPairAddresses = await Promise.all(stablecoinAddresses.map(stablecoinAddress => this.getPairAddress(wrappedNativeTokenAddress, stablecoinAddress)))
    const workingStablecoinPairAddresses = stablecoinPairAddresses.filter(pairAddress => pairAddress !== zeroAddress)

    if (workingStablecoinPairAddresses.length === 0) {
      throw new Error(`[Dexters|${this.chainId}|${this.dexId}] No working stablecoin pairs found for token ${wrappedNativeTokenAddress}`)
    }

    const pairAddressToData = {}

    // Create a pair listener for every stablecoin
    const unlisteners = await Promise.all(workingStablecoinPairAddresses.map(pairAddress => (
      this.addPairListener(pairAddress, syncEventData => this.oracle(pairAddress, syncEventData, data => {
        pairAddressToData[pairAddress] = data

        // The final price is a weighted average of the prices by the reserve
        // Of the different pairs
        const priceComputationData = Object.values(pairAddressToData)
        let sumWeighted = new BigNumber(0)
        let sumReserve = new BigNumber(0)

        priceComputationData.forEach(({ [wrappedNativeTokenAddress]: { price, reserve } }) => {
          sumWeighted = sumWeighted.plus(price.times(reserve))
          sumReserve = sumReserve.plus(reserve)
        })

        callback({
          timestamp: data.timestamp,
          priceUSD: sumWeighted.div(sumReserve),
        })
      }))
    )))

    // Return compound unlistener
    return () => unlisteners.forEach(unlistener => unlistener())
  }

  async addPairListener(pairAddress, callback) {
    if (!this.pairAddressToListenerToUnlistener[pairAddress]) {
      this.pairAddressToListenerToUnlistener[pairAddress] = new Map()
    }

    if (this.pairAddressToListenerToUnlistener[pairAddress].has(callback)) {
      return this.pairAddressToListenerToUnlistener[pairAddress].get(callback)
    }

    const pairContract = this.getPairContract(pairAddress)
    const [tokenAddress0, tokenAddress1] = await this.getPairAddresses(pairAddress)

    const listener = async (reserve0, reserve1, event) => {
      const { timestamp } = await event.getBlock()

      callback({
        timestamp,
        [tokenAddress0]: new BigNumber(reserve0.toString()),
        [tokenAddress1]: new BigNumber(reserve1.toString()),
      })
    }

    pairContract.on('Sync', listener)

    const unlistener = () => pairContract.off('Sync', listener)

    this.pairAddressToListenerToUnlistener[pairAddress].set(callback, unlistener)

    return unlistener
  }

  oracle(pairAddress, syncEventData, callback) {
    const [tokenAddress0, tokenAddress1] = this.getPairTokenAddresses(pairAddress)

    const {
      timestamp,
      [tokenAddress0]: reserve0,
      [tokenAddress1]: reserve1,
    } = syncEventData

    let price0
    let price1
    const decimal0 = new BigNumber(`1e+${this.getToken(tokenAddress0).decimals}`)
    const decimal1 = new BigNumber(`1e+${this.getToken(tokenAddress1).decimals}`)

    if (reserve0.gt(0)) {
      price0 = decimal0
        .div(decimal1)
        .times(reserve1)
        .div(reserve0)
    }
    if (reserve1.gt(0)) {
      price1 = decimal1
        .div(decimal0)
        .times(reserve0)
        .div(reserve1)
    }

    if (!(price0 && price1)) {
      console.warn(`[Dexters|${this.chainId}|${this.dexId}] No oracle price was computed for ${pairAddress}`)

      return
    }

    callback({
      timestamp,
      [tokenAddress0]: {
        price: price0,
        reserve: reserve0,
      },
      [tokenAddress1]: {
        price: price1,
        reserve: reserve1,
      },
    })
  }

  /* ---
    HELPERS
  --- */

  _registerPair(pairAddress, tokenAddress0, tokenAddress1) {
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

}

module.exports = Dex
