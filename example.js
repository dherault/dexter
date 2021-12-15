const { ethers } = require('ethers')

const Dexter = require('.')

async function main() {
  const dexter = new Dexter(1666600000) // Harmony mainnet
  const currencySymbol = dexter.chainMetadata.nativeCurrency.symbol

  console.log('currencySymbol', currencySymbol)

  const dexIds = dexter.getDexIds()

  console.log('dexIds', dexIds)

  const sushiswap = dexter.getDex('sushiswap')

  const dai = dexter.getToken('DAI').address
  const wone = dexter.getToken('WONE').address

  console.log('DAI', dai)
  console.log('WONE', dai)

  const pairAddress = await sushiswap.getPairAddress(dai, wone)

  console.log('pairAddress', pairAddress)

  const pairPrices = await sushiswap.getPairPrices(pairAddress)

  console.log('pairPrices')
  console.log('DAI', ethers.utils.formatEther(pairPrices[dai]))
  console.log('WONE', ethers.utils.formatEther(pairPrices[wone]))
}

main()
