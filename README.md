# Free TON Atomic Swaps JavaScript library

### Features

- Support for two-way exchange between the following blockchains / tokens:
 - Free TON <-> Ethereum
 - Free TON <-> ERC20 Token
 - Free TON <-> Bitcoin
- Fully automatic exchange without user intervention
- Smart contract based order book
- Automatic request for gas prices
- MetaMask support

The Atomic Swap exchange is based on HTLC Contracts on each blockchain. This type of contracts allows exchanges between blockchains with guaranteed atomicity - that is, the exchange will either take place, or you will receive your funds back. 

### Build
Tested on Ubuntu 18.10

```
npm install
npm run build
```
The build result will be in the folder ./dist

### Testing
```
npm run test
```
Open with browser http://127.0.0.1:8001/test-orderbook.html
Open javascript console, wait for test completion

### Mainnet
The library is currently running in testnet. To migrate to mainnet, deploy smart contracts to mainnet and edit the file ./src/configs.js

### Related projects
[Ethereum Atomic Swaps smart contracts](https://github.com/ton-swaps/ethswap)
[Free TON Atomic Swaps smart contracts](https://github.com/ton-swaps/tonswapsmc)
[Free TON Atomic Swaps Dapp](https://github.com/ton-swaps/tonswapapp)

### Submission
This remark was added for participation in [Free TON Contest: Atomic Swaps on Free TON [31 August 2020 - 20 September 2020]](https://forum.freeton.org/t/contest-atomic-swaps-on-free-ton-31-august-2020-20-september-2020/2508)

### Author
E-mail: sergeydobkin8@gmail.com
Telegram: @Sergeydobkin

### License
MIT
