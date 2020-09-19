const BtcSwap = require('./swaps/BtcSwap');
const { testnet_config } = require('./configs.js');


class BtcSwapInitiator {
    constructor(sourcePK, targetPK, seed, secret, secretHash, config) {
        console.log('BtcSwapInitiator', sourcePK, targetPK, seed, secret, secretHash)
        this.sourcePK = sourcePK;
        this.targetPK = targetPK;
        this.seed = seed;
        this.secret = secret;
        this.secretHash = secretHash;
        this.config = config || testnet_config;

        this.swap = new BtcSwap({
            mainnet: this.config.isMainnet,
            mnemonic: seed
        });
    }

    async create(amount, lockTime) {
        if (this.transactionHash || this.swapObj) {
            throw Error('Already created');
        }
        
        this.amount = amount
        this.lockTime = lockTime
        this.scriptValues = this.swap.getScripValues(this.secretHash, this.sourcePK, this.targetPK, this.lockTime);

        try {
          console.log('create scriptValues', this.scriptValues)
          await this.swap.fundScript({
                  scriptValues: this.scriptValues,
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
      this.scriptValues = this.swap.getScripValues(this.secretHash, this.sourcePK, this.targetPK, this.lockTime);

      try {
        const result = await this.swap.refund({
          scriptValues: this.scriptValues,
          secret: this.secretHash // may be with 0x
        });
        console.log('withdrawWithTimeout result', result);
        return result;
      } catch (e) {
        throw Error('Cannot withdraw')
      }
    }
    
    async getSwap() {
      const swap = {
        secret: '0x0'
      }
      this.swapObj = await this.swap.swaps({
          ownerAddress: this.sourcePK,
          participantAddress: this.targetPK
      });
      this.
      console.log('swapObj', this.swapObj);
      return this.swapObj;

    }

    async getGasPrice(speed='fast') {
        let gasPrice = await this.swap.estimateGasPrice(speed);
        console.log('gasPrice', gasPrice.toString(10));
        return gasPrice;
    }
}


class BtcSwapReceiver {
    constructor(sourcePK, targetPK, seed, secret, secretHash, config) {
        
        this.sourcePK = sourcePK;
        this.targetPK = targetPK;
        this.seed = seed;
        this.secret = secret;
        this.secretHash = secretHash;
        this.config = config || testnet_config

        this.swap = new BtcSwap({
            mainnet: this.config.isMainnet,
            mnemonic: seed
        });
    }

    async checkSwapParams(swap) {
        if (swap.balance !== this.value)
            return false;
    }

    async getSwap() {

      this.swapObj = await this.swap.swaps({
          ownerAddress: this.sourcePK,
          participantAddress: this.targetPK
      });
      console.log('swapObj', this.swapObj);
      return this.swapObj;

    }

    async withdraw() {

      try {
          let receipt = await this.swap.withdraw({
                  secret: this.secret,
                  ownerAddress: this.sourcePK
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

    async getGasPrice(speed='fast') {
        let gasPrice = await this.swap.estimateGasPrice(speed);
        console.log('gasPrice', gasPrice.toString(10));
        return gasPrice;
    }
}

module.exports = {BtcSwapInitiator, BtcSwapReceiver};