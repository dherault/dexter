const { ethers } = require('ethers')

const Dex = require('./Dex')

class Dexters {

  constructor(chainId) {
    this.chainId = chainId
    this.chainMetadata = require(`blockchain-datasets/data/blockchains/${chainId}/metadata.json`)

    if (!this.chainMetadata) {
      throw new Error(`Unsupported chainId: ${chainId}`)
    }

    this.provider = new ethers.providers.JsonRpcProvider(this.chainMetadata.rpc[0])

    this.tokenAddressToMetadata = require(`blockchain-datasets/data/blockchains/${chainId}/tokens.json`)
    this.stablecoinAddressToMetadata = require(`blockchain-datasets/data/blockchains/${chainId}/stablecoins.json`)
    this.tokenSymbolToMetadata = {}

    Object.values(this.tokenAddressToMetadata).forEach(tokenInfo => {
      this.tokenSymbolToMetadata[tokenInfo.symbol] = tokenInfo
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
    return this.tokenSymbolToMetadata[symbolOrAddress] || this.tokenAddressToMetadata[symbolOrAddress]
  }

  // ! deprecated
  getCrossTokens(dexId0, dexId1) {
    const dex0 = this.getDex(dexId0)
    const dex1 = this.getDex(dexId1)
    const tokensAddresses0 = new Set(Object.keys(dex0.tokenAddressToMetadata))
    const tokensAddresses1 = new Set(Object.keys(dex1.tokenAddressToMetadata))

    const commonTokenAddresses = new Set([...tokensAddresses0].filter(x => tokensAddresses1.has(x)))

    const tokenAddressTokenMetadata = {}

    commonTokenAddresses.forEach(tokenAddress => {
      tokenAddressTokenMetadata[tokenAddress] = dex0.tokenAddressToMetadata[tokenAddress]
    })

    return tokenAddressTokenMetadata
  }

}

module.exports = Dexters
