const BtcSwap = require('./swaps/BtcSwap');
const { testnet_config } = require('./configs.js');


class BtcSwapInitiator {
    constructor(sourcePK, targetPK, seed, secretHash, config) {
        console.log('BtcSwapInitiator', sourcePK, targetPK, seed, secretHash)
        this.sourcePK = sourcePK;
        this.targetPK = targetPK;
        this.seed = seed;
        this.secretHash = secretHash;
        this.config = config || testnet_config;

        this.swap = new BtcSwap({
            mainnet: this.config.isMainnet,
            mnemonic: seed
        });
    }

    async create(amount, lockTime) {
      console.log('initiator create', amount, lockTime)
      if (this.transactionHash || this.swapObj) {
          throw Error('Already created');
      }
      
      this.amount = amount
      this.lockTime = lockTime
      this.scriptValues = this.swap.getScripValues(this.secretHash, this.sourcePK, this.targetPK, this.lockTime);

      try {
        console.log('create scriptValues', this.scriptValues)
        const res = await this.swap.fundScript({
                scriptValues: this.scriptValues,
                amount: this.amount,
                mnemonic: this.seed
            },
            (transactionHash) => {this.transactionHash = transactionHash;}
        );
        console.log('res', res);
        console.log('_transactionHash', this.transactionHash);
      } catch (e) {
        console.log('error create', e);
        throw Error('Cannot send Bitcoin transaction')
      }

      console.log('initiator create return', this.transactionHash)
      return this.transactionHash;
    }

    async withdrawWithTimeout(amount, lockTime) {
      console.log('initiator withdrawWithTimeout', amount, lockTime)

      this.amount = amount
      this.lockTime = lockTime
      const scriptValues = this.swap.getScripValues(this.secretHash, this.sourcePK, this.targetPK, this.lockTime);

      try {
          let receipt = await this.swap.withdraw({
                  scriptValues: scriptValues,
                  secret: '0x0000000000000000000000000000000000000000000000000000000000000000'
              },
              true,
              (transactionHash) => {this.transactionHash = transactionHash;}
          );
          console.log('initiator withdrawWithTimeout', this.transactionHash)
          return this.transactionHash;
      } catch (e) {
          console.log('withdraw error:', e);
          throw Error('Withdraw error')
      }

    }
    
    /*
    returns secret or undefined
    */
    async getSwap(lockTime) {
      console.log('initiator getSwap', lockTime)

      const scriptValues = this.swap.getScripValues(this.secretHash, this.sourcePK, this.targetPK, lockTime);

      const swapObj = await this.swap.getSecret(scriptValues);
      console.log('initiator getSwap return', swapObj)
      return swapObj;
    }

    async getScriptBalance(lockTime) {
      console.log('initiator getScriptBalance', lockTime)

      const scriptValues = this.swap.getScripValues(this.secretHash, this.sourcePK, this.targetPK, lockTime);

      const balance = await this.swap.getBalance(scriptValues);
      console.log('initiator getScriptBalance return', balance)
      return balance;

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

    /*
    returns check status - is script presents with correct values
    */
    async getSwap(amount, lockTime) {
      console.log('receiver getSwap', amount, lockTime)

      this.amount = amount
      this.lockTime = lockTime
      const scriptValues = this.swap.getScripValues(this.secretHash, this.sourcePK, this.targetPK, this.lockTime);

      scriptValues.value = amount
      scriptValues.recipientPublicKey = this.targetPK

      const swapObj = await this.swap.checkScript(scriptValues);
      console.log('receiver getSwap return', swapObj);
      return swapObj;
    }

    async withdraw(amount, lockTime, secret) {
      console.log('receiver withdraw', amount, lockTime, secret)

      this.amount = amount
      this.lockTime = lockTime
      this.secret = secret
      const scriptValues = this.swap.getScripValues(this.secretHash, this.sourcePK, this.targetPK, this.lockTime);

      try {
          let receipt = await this.swap.withdraw({
                  scriptValues: scriptValues,
                  secret: this.secret
              },
              false,
              (transactionHash) => {this.transactionHash = transactionHash;}
          );
          console.log('receiver withdraw return', this.transactionHash);
          return this.transactionHash;
      } catch (e) {
          console.log('withdraw error:', e);
          throw Error('Withdraw error')
      }

    }

    async getScriptBalance(lockTime) {
      console.log('receiver getScriptBalance', lockTime)

      const scriptValues = this.swap.getScripValues(this.secretHash, this.sourcePK, this.targetPK, lockTime);

      const balance = await this.swap.getBalance(scriptValues);
      console.log('receiver balance return', balance);
      return balance;

    }
}

module.exports = {BtcSwapInitiator, BtcSwapReceiver};