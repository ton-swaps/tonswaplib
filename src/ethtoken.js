const EthTokenSwap = require('./swaps/EthTokenSwap');
const Web3 = require("web3");
const { testnet_config } = require('./configs.js');


class EthTokenSwapInitiator {
    constructor(token, sourceAddress, targetAddress, secretHash, config) {
        
        this.sourceAddress = sourceAddress;
        this.targetAddress = targetAddress;
        this.secretHash = secretHash;
        this.config = config || testnet_config
        this.tokenAddress = this.config.tokens[token].address
        this.token = token

        this.swap = new EthTokenSwap({
            mainnet: this.config.isMainnet,
            address: this.config.contracts.eth_token_address,
            abi: this.config.contracts.eth_token_abi,
            name: token,
            decimals: this.config.tokens[token].decimals,
            tokenAddress: this.config.tokens[token].address,
            tokenAbi: this.config.tokens[token].abi,
            gasLimit: 4e5,
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

    async approve(amount) {
      try {
        const result = await this.swap.approve({
          amount: amount
        });
        console.log('approve result', result);
        return result ? result.transactionHash : undefined;
      } catch (e) {
        throw Error('Cannot approve')
      }
    }

    async checkApprove() {
      try {
        const result = await this.swap.checkAllowance({
          spender: this.sourceAddress
        });
        console.log('checkApprove result', result);
        return result;
      } catch (e) {
        throw Error('Cannot checkApprove')
      }
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


class EthTokenSwapReceiver {
    constructor(token, sourceAddress, targetAddress, secret, secretHash, config) {
        
        this.sourceAddress = sourceAddress;
        this.targetAddress = targetAddress;
        this.secret = secret;
        this.secretHash = secretHash;
        this.config = config || testnet_config
        this.tokenAddress = this.config.tokens[token].address
        this.token = token

        this.swap = new EthTokenSwap({
            mainnet: this.config.isMainnet,
            address: this.config.contracts.eth_token_address,
            abi: this.config.contracts.eth_token_abi,
            name: token,
            decimals: this.config.tokens[token].decimals,
            tokenAddress: this.config.tokens[token].address,
            tokenAbi: this.config.tokens[token].abi,
            gasLimit: 4e5,
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

module.exports = {EthTokenSwapInitiator, EthTokenSwapReceiver};