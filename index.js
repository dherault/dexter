const { ethers } = require('ethers')

class Dexter {

  constructor(chainId) {
    this.chainId = chainId
    this.chainMetadata = require(`ultimate-token-list/data/blockchains/${chainId}.json`)

    if (!this.chainMetadata) {
      throw new Error(`Unsupported chainId: ${chainId}`)
    }

    this.provider = new ethers.providers.JsonRpcProvider(this.chainMetadata.rpc[0])

    this.tokenAddressToTokenMetadata = require(`ultimate-token-list/data/tokens/${chainId}.json`)
    this.tokenSymbolToTokenMetadata = {}

    Object.values(this.tokenAddressToTokenMetadata).forEach(tokenInfo => {
      this.tokenSymbolToTokenMetadata[tokenInfo.symbol] = tokenInfo
    })

    this.dexIdToDex = {}

    this.getDexIds().forEach(dexId => {
      this.dexIdToDex[dexId] = new Dex(chainId, dexId, this.provider)
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

}

class Dex {

  constructor(chainId, dexId, provider) {
    this.chainId = chainId
    this.dexId = dexId
    this.provider = provider

    this.metadata = require(`ultimate-token-list/data/dexes/${dexId}/metadata.json`)
    this.contractNameToContractMetadata = require(`ultimate-token-list/data/dexes/${dexId}/contracts/${chainId}.json`)

    const pairFactoryContractInfo = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.factory]

    this.pairFactoryContract = new ethers.Contract(pairFactoryContractInfo.address, pairFactoryContractInfo.abi, provider)
  }

  async getPairAddress(tokenAdress0, tokenAdress1) {
    return this.pairFactoryContract.getPair(tokenAdress0, tokenAdress1)
  }

  async getPairPrices(pairAddress) {
    const pairContractInfo = this.contractNameToContractMetadata[this.metadata.contractTypeToContractName.pair]
    const pairContract = new ethers.Contract(pairAddress, pairContractInfo.abi, this.provider)

    const token0 = await pairContract.token0()
    const token1 = await pairContract.token1()
    const { _reserve0, _reserve1 } = await pairContract.getReserves()

    return {
      [token0]: _reserve0,
      [token1]: _reserve1,
    }
  }

}

module.exports = Dexter
