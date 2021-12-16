const { ethers } = require('ethers')

const Dexters = require('.')

async function main() {
  const dexter = new Dexters(1666600000) // Harmony mainnet
  const currencySymbol = dexter.chainMetadata.nativeCurrency.symbol

  console.log('currencySymbol', currencySymbol)

  const dexIds = dexter.getDexIds()

  console.log('dexIds', dexIds)

  await displayPairPrice(dexter, 'sushiswap', 'DAI', 'WONE')
  await displayPairPrice(dexter, 'fatex', 'DAI', 'WONE')

  const crossTokens = dexter.getCrossTokens('sushiswap', 'fatex')

  console.log('crossTokens', Object.values(crossTokens).map(x => x.symbol))
}

async function displayPairPrice(dexter, dexId, tokenSymbol0, tokenSymbol1) {
  const dex = dexter.getDex(dexId)

  console.log('dex:', dexId)

  const address0 = dexter.getToken(tokenSymbol0).address
  const address1 = dexter.getToken(tokenSymbol1).address

  const pairAddress = await dex.getPairAddress(address0, address1)

  console.log('pairAddress', pairAddress)

  const pairPrices = await dex.getPairPrices(pairAddress)

  console.log(tokenSymbol0, ethers.utils.formatEther(pairPrices[address0]))
  console.log(tokenSymbol1, ethers.utils.formatEther(pairPrices[address1]))
  console.log('ratio', parseFloat(ethers.utils.formatEther(pairPrices[address0])) / parseFloat(ethers.utils.formatEther(pairPrices[address1])))

  return dex
}

main()
