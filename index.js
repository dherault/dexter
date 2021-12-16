const { ethers } = require('ethers')

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
      this.dexIdToDex[dexId] = new Dex(this, chainId, dexId)
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

    const pairFactoryContractInfo = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.factory]

    this.pairFactoryContract = new ethers.Contract(pairFactoryContractInfo.address, pairFactoryContractInfo.abi, this.dexters.provider)

    this.stablecoinAddressToStablecoinMetadata = require(`ultimate-token-list/data/dexes/${dexId}/stablecoins/${chainId}.json`)
    this.tokenAddressToTokenMetadata = require(`ultimate-token-list/data/dexes/${dexId}/tokens/${chainId}.json`)
    this.tokenSymbolToTokenMetadata = {}

    Object.values(this.tokenAddressToTokenMetadata).forEach(tokenInfo => {
      this.tokenSymbolToTokenMetadata[tokenInfo.symbol] = tokenInfo
    })
  }

  async getPairAddress(tokenAdress0, tokenAdress1) {
    return this.pairFactoryContract.getPair(tokenAdress0, tokenAdress1)
  }

  async getPairPrices(pairAddress) {
    const pairContractInfo = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.pair]
    const pairContract = new ethers.Contract(pairAddress, pairContractInfo.abi, this.dexters.provider)

    const token0 = await pairContract.token0()
    const token1 = await pairContract.token1()
    const { _reserve0, _reserve1 } = await pairContract.getReserves()

    return {
      [token0]: _reserve0,
      [token1]: _reserve1,
    }
  }

  getToken(symbolOrAddress) {
    return this.tokenSymbolToTokenMetadata[symbolOrAddress] || this.tokenAddressToTokenMetadata[symbolOrAddress]
  }

}

module.exports = Dexters
