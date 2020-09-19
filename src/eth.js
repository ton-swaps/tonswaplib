const EthSwap = require('./swaps/EthSwap');
const Web3 = require("web3");
const { testnet_config } = require('./configs.js');

const ethInit = () => {
  if (typeof window !== 'undefined' && window.ethereum) {
    window.web3 = new Web3(window.ethereum);
  }
}

const ethEnabled = () => {
    if (typeof window !== 'undefined' && window.ethereum) {
        window.web3 = new Web3(window.ethereum);
        window.ethereum.enable();
        return true;
    }
    return false;
}

const ethGetAddresses = async () => {
    return await window.web3.eth.getAccounts();
}

const waitEthAddresses = async () => {

    while (!ethEnabled()) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    while((await ethGetAddresses()).length === 0) {
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    let addresses = await ethGetAddresses();
    console.log('ethereum addresses', addresses);
    return addresses;
}


class EthSwapInitiator {
    constructor(sourceAddress, targetAddress, secretHash, config) {
        
        this.sourceAddress = sourceAddress;
        this.targetAddress = targetAddress;
        this.secretHash = secretHash;
        this.config = config || testnet_config

        this.swap = new EthSwap({
            mainnet: this.config.isMainnet,
            address: this.config.contracts.eth_address,
            abi: this.config.contracts.eth_abi,
            gasLimit: 3e5,
            gasPrice: 2e9,
            getParticipantAddress: () => sourceAddress
        });

    }

    async create(amount) {
        if (this.transactionHash || this.swapObj) {
            throw Error('Already created');
        }
        
        this.amount = amount

        try {
            await this.swap.create({
                    secretHash: this.secretHash,
                    participantAddress: this.targetAddress,
                    amount: this.amount
                },
                (transactionHash) => {this.transactionHash = transactionHash;}
            );
            console.log('_transactionHash', this.transactionHash);
        } catch (e) {
            console.log('error create', e);
            throw Error('Cannot send Ethereum transaction')
        }

        return this.transactionHash;
    }

    async withdrawWithTimeout() {
      try {
        const result = await this.swap.refund({
          participantAddress: this.targetAddress
        });
        console.log('withdrawWithTimeout result', result);
        return result;
      } catch (e) {
        throw Error('Cannot withdraw')
      }
    }
    
    async getSwap() {

      this.swapObj = await this.swap.swaps({
          ownerAddress: this.sourceAddress,
          participantAddress: this.targetAddress
      });
      console.log('swapObj', this.swapObj);
      return this.swapObj;

    }

    async getMyBalance() {
        let bl = await this.swap.fetchBalance(this.sourceAddress);
        console.log('sourceAddress balance', bl);
        return bl;
    }

    async getGasPrice(speed='fast') {
        let gasPrice = await this.swap.estimateGasPrice(speed);
        console.log('gasPrice', gasPrice.toString(10));
        return gasPrice;
    }
}


class EthSwapReceiver {
    constructor(sourceAddress, targetAddress, secret, secretHash, config) {
        
        this.sourceAddress = sourceAddress;
        this.targetAddress = targetAddress;
        this.secret = secret;
        this.secretHash = secretHash;
        this.config = config || testnet_config

        this.swap = new EthSwap({
            mainnet: this.config.isMainnet,
            address: this.config.contracts.eth_address,
            abi: this.config.contracts.eth_abi,
            gasLimit: 3e5,
            gasPrice: 2e9,
            getParticipantAddress: () => targetAddress
        });

    }

    async checkSwapParams(swap) {
        if (swap.balance !== this.value)
            return false;
    }

    async getSwap() {

      this.swapObj = await this.swap.swaps({
          ownerAddress: this.sourceAddress,
          participantAddress: this.targetAddress
      });
      console.log('swapObj', this.swapObj);
      return this.swapObj;

    }

    async withdraw() {

      try {
          let receipt = await this.swap.withdraw({
                  secret: this.secret,
                  ownerAddress: this.sourceAddress
              },
              (transactionHash) => {this.transactionHash = transactionHash;}
          );
          console.log('receipt:', receipt);
          return this.transactionHash;
      } catch (e) {
          console.log('withdraw error:', e);
          throw Error('Withdraw error')
      }

    }

    async getMyBalance() {
        let bl = await this.swap.fetchBalance(this.targetAddress);
        console.log('sourceAddress balance', bl);
        return bl;
    }

    async getGasPrice(speed='fast') {
        let gasPrice = await this.swap.estimateGasPrice(speed);
        console.log('gasPrice', gasPrice.toString(10));
        return gasPrice;
    }
}

module.exports = {ethInit, ethEnabled, waitEthAddresses, EthSwapInitiator, EthSwapReceiver};