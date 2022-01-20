const { ethers } = require('ethers')
const ERC20ABI = require('blockchain-datasets/data/abis/ERC20.json')

const Dex = require('./Dex')

// Dexters is a middleware to the blockchain
class Dexters {

  constructor(blockchainId, provider) {
    if (!blockchainId) {
      throw new Error('[Dexters] Pass a blockchain id as the first argument')
    }

    this.blockchainId = blockchainId

    try {
      this.blockchainMetadata = require(`blockchain-datasets/data/blockchains/${blockchainId}/metadata.json`)
    }
    catch (error) {
      throw new Error(`[Dexters|${blockchainId}] Unsupported blockchainId`)
    }

    // Provider
    this.provider = provider || new ethers.providers.JsonRpcProvider(this.blockchainMetadata.rpc[0])

    // Dexes
    this.dexIdToDex = {}

    this.getDexIds().forEach(dexId => {
      this.dexIdToDex[dexId] = new Dex(this, dexId)
    })

    // Tokens data cache
    this.tokenAddressToContract = {}
    this.tokenAddressToTokenName = {}
    this.tokenAddressToTokenSymbol = {}
    this.tokenAddressToTokenDecimals = {}
    this.tokenAddressToTokenCreationBlockTime = {}
  }

  /* ---
    DEXES
  --- */

  // Get all the Dex ids
  getDexIds() {
    return this.blockchainMetadata.dexes
  }

  // Get a Dex by id
  getDex(id) {
    return this.dexIdToDex[id]
  }

  /* ---
    TOKENS
  --- */

  getERC20TokenContract(tokenAddress) {
    if (this.tokenAddressToContract[tokenAddress]) {
      return this.tokenAddressToContract[tokenAddress]
    }

    return this.tokenAddressToContract[tokenAddress] = new ethers.Contract(tokenAddress, ERC20ABI, this.provider)
  }

  async getERC20TokenBalanceOf(tokenAddress, accountAddress) {
    try {
      return this.getERC20TokenContract(tokenAddress).balanceOf(accountAddress)
    }
    catch (error) {
      return null
    }
  }

  async getERC20TokenTotalSupply(tokenAddress) {
    if (this.tokenAddressToTokenName[tokenAddress]) {
      return this.tokenAddressToTokenName[tokenAddress]
    }

    try {
      return this.tokenAddressToTokenName[tokenAddress] = await this.getERC20TokenContract(tokenAddress).totalSupply()
    }
    catch (error) {
      return null
    }
  }

  async getERC20TokenName(tokenAddress) {
    if (this.tokenAddressToTokenName[tokenAddress]) {
      return this.tokenAddressToTokenName[tokenAddress]
    }

    try {
      return this.tokenAddressToTokenName[tokenAddress] = await this.getERC20TokenContract(tokenAddress).name()
    }
    catch (error) {
      return null
    }
  }

  async getERC20TokenSymbol(tokenAddress) {
    if (this.tokenAddressToTokenSymbol[tokenAddress]) {
      return this.tokenAddressToTokenSymbol[tokenAddress]
    }

    try {
      return this.tokenAddressToTokenSymbol[tokenAddress] = await this.getERC20TokenContract(tokenAddress).symbol()
    }
    catch (error) {
      return null
    }
  }

  async getERC20TokenDecimals(tokenAddress) {
    if (this.tokenAddressToTokenDecimals[tokenAddress]) {
      return this.tokenAddressToTokenDecimals[tokenAddress]
    }

    try {
      return this.tokenAddressToTokenDecimals[tokenAddress] = await this.getERC20TokenContract(tokenAddress).decimals()
    }
    catch (error) {
      return null
    }
  }

  // async getERC20TokenCreationBlockTime(tokenAddress) {
  //   if (this.tokenAddressToTokenCreationBlockTime[tokenAddress]) {
  //     return this.tokenAddressToTokenCreationBlockTime[tokenAddress]
  //   }

  //   try {
  //     return this.tokenAddressToTokenCreationBlockTime[tokenAddress] = await this.provider.getTransactionReceipt('0x5579574f4da9f01f92a000910ed1a6caecac0c53358d69bf0dee798c22e466f3')
  //   }
  //   catch (error) {
  //     console.log('error', error)
  //     return null
  //   }
  // }

}

module.exports = Dexters
