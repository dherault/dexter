const { ethers } = require('ethers')
const BigNumber = require('bignumber.js')
const chalk = require('chalk')

const zeroAddress = '0x0000000000000000000000000000000000000000'

class Dex {

  constructor(dexters, dexId) {
    this.dexters = dexters
    this.dexId = dexId

    // Metadata
    this.metadata = require(`blockchain-datasets/data/dexes/${dexId}/metadata.json`)
    this.contractNameToContractMetadata = require(`blockchain-datasets/data/dexes/${dexId}/contracts/${this.dexters.blockchainId}.json`)
    this.stablecoinAddressToMetadata = require(`blockchain-datasets/data/dexes/${dexId}/stablecoins/${this.dexters.blockchainId}.json`)
    this.isUniswapV2 = this.metadata.contractTypeToContractName.factory === 'UniswapV2Factory'

    // Contracts cache
    this.routerContract = null
    this.factoryContract = null
    this.pairAddressToContract = {}

    // Pairs cache
    this.pairAddressToTokenAddresses = {}
    this.tokenAddress0ToTokenAddress1ToPairAddress = {}

    this.log = (...args) => console.log(`${chalk.blue('[Dexters|')}${chalk.yellow(this.dexters.blockchainId)}${chalk.blue(`|${this.dexId}]`)}`, ...args)
    this.logError = (...args) => console.log(`${chalk.red('[Dexters|')}${chalk.yellow(this.dexters.blockchainId)}${chalk.red(`|${this.dexId}]`)}`, ...args)
    this.logWarn = (...args) => console.log(`${chalk.gray('[Dexters|')}${chalk.yellow(this.dexters.blockchainId)}${chalk.gray(`|${this.dexId}]`)}`, ...args)
  }

  /* ---
    CONTRACTS
  --- */

  getRouterContract() {
    if (this.routerContract) {
      return this.routerContract
    }

    const routerContractMetadata = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.router]

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

  // From a pair address to tokens addresses
  async getPairAddresses(pairAddress) {
    if (this.isUniswapV2) {
      if (this.pairAddressToTokenAddresses[pairAddress]) {
        return this.pairAddressToTokenAddresses[pairAddress]
      }

      const pairContract = this.getPairContract(pairAddress)

      try {
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
      catch (error) {
        return [] // !
      }
    }

    throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] Unsupported pair contract type`)
  }

  // From token addresses to pair address
  async getPairAddress(tokenAddress0, tokenAddress1) {
    if (this.isUniswapV2) {
      if (this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0] && this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0][tokenAddress1]) {
        return this.tokenAddress0ToTokenAddress1ToPairAddress[tokenAddress0][tokenAddress1]
      }

      let pairAddress

      try {
        pairAddress = await this.getFactoryContract().getPair(tokenAddress0, tokenAddress1)
      }
      catch (error) {
        pairAddress = zeroAddress
      }

      // Can happen if tokenAddress0 and tokenAddress1 are not paired
      if (pairAddress === zeroAddress) {
        throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] No pair found for ${tokenAddress0} and ${tokenAddress1}`)
      }

      this._registerPair(pairAddress, tokenAddress0, tokenAddress1)

      return pairAddress
    }

    throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] Unsupported factory contract type`)
  }

  /* ---
    PAIR GETTERS
  --- */

  async getPairs() {
    if (this.isUniswapV2) {
      this.log('Getting all pairs on UniswapV2Factory, this could take a while...')

      const factoryContract = this.getFactoryContract()
      let nPairsBigNumber = 0

      try {
        nPairsBigNumber = await factoryContract.allPairsLength()
      }
      catch (error) {
        this.logError('Error getting allPairsLength on UniswapV2Factory)')
      }

      const nPairs = new BigNumber(nPairsBigNumber.toString()).toNumber()
      const pairs = {}
      const increment = 64

      for (let i = 0; i < nPairs; i += increment) {
        this.log(`Getting all pairs on UniswapV2Factory, ${i}/${nPairs}`)

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

        try {
          Object.assign(pairs, ...(await Promise.all(promises)))
        }
        catch (error) {
          this.logError('Error getting all pairs on UniswapV2Factory)')
        }
      }

      return pairs
    }

    throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] Unsupported factory contract type`)
  }

  async getPairReserves(pairAddress) {
    if (this.isUniswapV2) {
      const pairContract = this.getPairContract(pairAddress)

      try {
        const [
          [tokenAddress0, tokenAddress1],
          { _reserve0, _reserve1 },
        ] = await Promise.all([
          this.getPairAddresses(pairAddress),
          pairContract.getReserves(),
        ])

        return {
          [tokenAddress0]: _reserve0.toString(),
          [tokenAddress1]: _reserve1.toString(),
        }
      }
      catch (error) {
        return {}
      }
    }

    throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] Unsupported pair contract type`)
  }

  /* ---
    LISTENERS
  --- */

  // Add a Sync listener for every stablecoin-wnative pair
  // Deduce the priceUSD from the weighted average off the wnative relative price
  async addStablecoinsSyncListener(callback) {
    const { wrappedNativeTokenAddress } = this.dexters.blockchainMetadata

    if (!wrappedNativeTokenAddress) {
      throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] wrappedNativeTokenAddress not set for this blockchain`)
    }

    const stablecoinAddresses = Object.keys(this.stablecoinAddressToMetadata)
    const stablecoinPairAddresses = await Promise.all(stablecoinAddresses.map(stablecoinAddress => this.getPairAddress(wrappedNativeTokenAddress, stablecoinAddress)))
    const workingStablecoinPairAddresses = stablecoinPairAddresses.filter(pairAddress => pairAddress !== zeroAddress)

    if (workingStablecoinPairAddresses.length === 0) {
      throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] No working stablecoin pairs found for token ${wrappedNativeTokenAddress}`)
    }

    const pairAddressToData = {}

    // Create a pair listener for every stablecoin
    const unlisteners = await Promise.all(workingStablecoinPairAddresses.map(pairAddress => (
      this._addUniswapV2PairSyncListener(pairAddress, syncEventData => this._oracle(pairAddress, syncEventData, data => {
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
          priceUSD: sumWeighted.div(sumReserve).toString(),
        })
      }))
    )))

    // Return compound unlistener
    return () => unlisteners.forEach(unlistener => unlistener())
  }

  // TODO handle non-UniswapV2Pair contracts
  async addSyncListener(tokenAddress0OrPairAddress, tokenAddress1OrCallback, callback) {
    if (this.isUniswapV2) {
      if (typeof tokenAddress1OrCallback === 'function') {
        return this._addUniswapV2PairSyncListener(tokenAddress0OrPairAddress, syncEventData => this._oracle(tokenAddress0OrPairAddress, syncEventData, tokenAddress1OrCallback))
      }

      const pairAddress = await this.getPairAddress(tokenAddress0OrPairAddress, tokenAddress1OrCallback)

      return this._addUniswapV2PairSyncListener(pairAddress, syncEventData => this._oracle(pairAddress, syncEventData, callback))
    }

    throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] Unsupported factory contract type`)
  }

  // TODO handle non-UniswapV2Pair contracts
  async addSwapListener(tokenAddress0OrPairAddress, tokenAddress1OrCallback, callback) {
    if (this.isUniswapV2) {
      if (typeof tokenAddress1OrCallback === 'function') {
        return this._addUniswapV2PairSwapListener(tokenAddress0OrPairAddress, tokenAddress1OrCallback)
      }

      const pairAddress = await this.getPairAddress(tokenAddress0OrPairAddress, tokenAddress1OrCallback)

      return this._addUniswapV2PairSwapListener(pairAddress, callback)
    }

    throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] Unsupported factory contract type`)
  }

  // TODO handle non-UniswapV2Pair contracts
  async addMintListener(tokenAddress0OrPairAddress, tokenAddress1OrCallback, callback) {
    if (this.isUniswapV2) {
      if (typeof tokenAddress1OrCallback === 'function') {
        return this._addUniswapV2PairMintListener(tokenAddress0OrPairAddress, tokenAddress1OrCallback)
      }

      const pairAddress = await this.getPairAddress(tokenAddress0OrPairAddress, tokenAddress1OrCallback)

      return this._addUniswapV2PairMintListener(pairAddress, callback)
    }

    throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] Unsupported factory contract type`)
  }

  // TODO handle non-UniswapV2Pair contracts
  async addBurnListener(tokenAddress0OrPairAddress, tokenAddress1OrCallback, callback) {
    if (this.isUniswapV2) {
      if (typeof tokenAddress1OrCallback === 'function') {
        return this._addUniswapV2PairBurnListener(tokenAddress0OrPairAddress, tokenAddress1OrCallback)
      }

      const pairAddress = await this.getPairAddress(tokenAddress0OrPairAddress, tokenAddress1OrCallback)

      return this._addUniswapV2PairBurnListener(pairAddress, callback)
    }

    throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] Unsupported factory contract type`)
  }

  /* ---
    INTERNAL LISTENERS
  --- */

  async _addUniswapV2PairSyncListener(pairAddress, callback) {
    const pairContract = this.getPairContract(pairAddress)
    const [tokenAddress0, tokenAddress1] = await this.getPairAddresses(pairAddress)

    const listener = async (reserve0, reserve1, event) => {
      try {
        const block = await event.getBlock()

        callback({
          timestamp: block ? block.timestamp : null,
          [tokenAddress0]: reserve0.toString(),
          [tokenAddress1]: reserve1.toString(),
        })
      }
      catch (error) {
        // Ignore
      }
    }

    pairContract.on('Sync', listener)

    return () => pairContract.off('Sync', listener)
  }

  async _addUniswapV2PairSwapListener(pairAddress, callback) {
    const pairContract = this.getPairContract(pairAddress)

    const listener = async (fromAddress, amountIn0, amountIn1, amountOut0, amountOut1, toAddress, event) => {
      try {
        const block = await event.getBlock()

        callback({
          timestamp: block ? block.timestamp : null,
          fromAddress,
          toAddress,
          amountIn0: amountIn0.toString(),
          amountIn1: amountIn1.toString(),
          amountOut0: amountOut0.toString(),
          amountOut1: amountOut1.toString(),
        })
      }
      catch (error) {
        // Ignore
      }
    }

    pairContract.on('Swap', listener)

    return () => pairContract.off('Swap', listener)
  }

  async _addUniswapV2PairMintListener(pairAddress, callback) {
    const pairContract = this.getPairContract(pairAddress)

    const listener = async (fromAddress, amount0, amount1, event) => {
      try {
        const block = await event.getBlock()

        callback({
          timestamp: block ? block.timestamp : null,
          fromAddress,
          amount0: amount0.toString(),
          amount1: amount1.toString(),
        })
      }
      catch (error) {
        // Ignore
      }
    }

    pairContract.on('Mint', listener)

    return () => pairContract.off('Mint', listener)
  }

  async _addUniswapV2PairBurnListener(pairAddress, callback) {
    const pairContract = this.getPairContract(pairAddress)

    const listener = async (fromAddress, amount0, amount1, toAddress, event) => {
      try {
        const block = await event.getBlock()

        callback({
          timestamp: block ? block.timestamp : null,
          fromAddress,
          toAddress,
          amount0: amount0.toString(),
          amount1: amount1.toString(),
        })
      }
      catch (error) {
        // Ignore
      }
    }

    pairContract.on('Burn', listener)

    return () => pairContract.off('Burn', listener)
  }

  /* ---
    ORACLE
  --- */

  async _oracle(pairAddress, syncEventData, callback) {
    const [tokenAddress0, tokenAddress1] = await this.getPairAddresses(pairAddress)

    const {
      timestamp,
      [tokenAddress0]: rawReserve0,
      [tokenAddress1]: rawReserve1,
    } = syncEventData

    if (!(rawReserve0 && rawReserve1)) {
      this.logWarn(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] No oracle reserve was synced for ${pairAddress}`)

      return
    }

    const reserve0 = new BigNumber(rawReserve0.toString())
    const reserve1 = new BigNumber(rawReserve1.toString())

    if (reserve0.isEqualTo(0) || reserve1.isEqualTo(0)) {
      this.logWarn(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] No oracle reserve was computed for ${pairAddress}`)

      return
    }

    const [price0, price1] = await this._computeRelativePrices(tokenAddress0, tokenAddress1, reserve0, reserve1)

    if (!(price0 && price1)) {
      this.logWarn(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] No oracle price was computed for ${pairAddress}`)

      return
    }

    callback({
      timestamp,
      [tokenAddress0]: {
        price: price0.toString(),
        reserve: reserve0.toString(),
      },
      [tokenAddress1]: {
        price: price1.toString(),
        reserve: reserve1.toString(),
      },
    })
  }

  async getCurrentRelativePrices(tokenAddress0, tokenAddress1) {
    const pairAddress = await this.getPairAddress(tokenAddress0, tokenAddress1)

    const {
      [tokenAddress0]: rawReserve0,
      [tokenAddress1]: rawReserve1,
    } = await this.getPairReserves(pairAddress)

    const reserve0 = new BigNumber(rawReserve0)
    const reserve1 = new BigNumber(rawReserve1)

    if (reserve0.isEqualTo(0) || reserve1.isEqualTo(0)) {
      return {}
    }

    const [price0, price1] = await this._computeRelativePrices(tokenAddress0, tokenAddress1, reserve0, reserve1)

    if (!(price0 && price1)) {
      throw new Error(`[Dexters|${this.dexters.blockchainId}|${this.dexId}] No oracle price was computed for ${pairAddress}`)
    }

    return {
      [tokenAddress0]: price0.toString(),
      [tokenAddress1]: price1.toString(),
    }
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

  async _computeRelativePrices(tokenAddress0, tokenAddress1, reserve0, reserve1) {
    const [decimals0, decimals1] = await Promise.all(
      [tokenAddress0, tokenAddress1].map(tokenAddress => this.dexters.getERC20TokenDecimals(tokenAddress).then(x => new BigNumber(`1e+${x}`)))
    )

    let price0
    let price1

    if (reserve0.gt(0)) {
      price0 = decimals0
        .div(decimals1)
        .times(reserve1)
        .div(reserve0)
    }
    if (reserve1.gt(0)) {
      price1 = decimals1
        .div(decimals0)
        .times(reserve0)
        .div(reserve1)
    }

    return [price0, price1]
  }

}

module.exports = Dex
