const { ethers } = require('ethers')

const Dexter = require('.')

async function main() {
  const dexter = new Dexter(1666600000) // Harmony mainnet
  const currencySymbol = dexter.chainMetadata.nativeCurrency.symbol

  console.log('currencySymbol', currencySymbol)

  const dexIds = dexter.getDexIds()

  console.log('dexIds', dexIds)

  await displayPairPrice(dexter, 'sushiswap', 'DAI', 'WONE')
  await displayPairPrice(dexter, 'fatex', 'DAI', 'WONE')
}

async function displayPairPrice(dexter, dexId, tokenSymbol0, tokenSymbol1) {
  const dex = dexter.getDex(dexId)

  console.log('dex:', dexId)

  const address0 = dexter.getToken(tokenSymbol0).address
  const address1 = dexter.getToken(tokenSymbol1).address

  // console.log(tokenSymbol0, address0)
  // console.log(tokenSymbol1, address1)

  const pairAddress = await dex.getPairAddress(address0, address1)

  console.log('pairAddress', pairAddress)

  const pairPrices = await dex.getPairPrices(pairAddress)

  console.log('pairPrices')
  console.log('DAI', ethers.utils.formatEther(pairPrices[address0]))
  console.log('WONE', ethers.utils.formatEther(pairPrices[address1]))
}

main()
