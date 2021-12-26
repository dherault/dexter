# Dexters

Query any dex data directly to the blockchain

## Installation

`npm install dexters`

## Usage

```js
const Dexters = require('dexters')

const dexter = new Dexters(137) // Polygon mainnet
const sushiswap = dexter.getDex('sushiswap') // SushiSwap dex

// This will populate sushiswap.wrappedNativePriceInUsd over time
// Based on stablecoins prices
await sushiswap.startListeningToWrappedNativePriceUpdates()

// Get any token metadata by symbol or address
const weth = sushiswap.getToken('WETH')

// Listen for price update of a specific token
// Based on the wrapped native price (above)
// Timestamp is a number
// Price is a BigNumber
await sushiswap.addWrappedNativePriceListener(weth.address, ({ timestamp, price }) => {
  console.log('Time:', timestamp)
  console.log('WETH in MATIC:', price.toString())
  console.log('WETH IN USD:', price.times(sushiswap.wrappedNativePriceInUsd).toString())
})
```

## BigNumber library

This package uses the [BigNumber.js](https://mikemcl.github.io/bignumber.js/) library.

## License

MIT
