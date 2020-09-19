const WalletAbi = require('./WalletAbi')
const { BigInteger } = require('javascript-biginteger');

class Wallet {
  constructor (client) {
      this.client = client
      this.abi = WalletAbi
  }

  async runSmcMethod (functionName, input={}, keys) {
    console.log('wallet runSmcMethod');
    console.log('address', this.smcAddress);
    console.log('abi', this.TonSwapOrderbookAbi);
    console.log('functionName', functionName);
    console.log('input', input);
    console.log('keys', keys);
    const res = await this.client.contracts.run({
      address: this.address,
      abi: this.abi,
      functionName,
      input: input,
      keyPair: keys,
    });
    console.log('output', res);
    return res;
  }

  async runGetMethod (functionName, input={}) {
    console.log('wallet runGetMethod');
    console.log('address', this.smcAddress);
    console.log('abi', this.TonSwapOrderbookAbi);
    console.log('functionName', functionName);
    console.log('input', input);
    const res = await this.client.contracts.runLocal({
      address: this.address,
      abi: this.abi,
      functionName,
      fullRun: false,
      input: input
    });
    console.log('output', res);
    return res.output;
  }
  
  async login (address, seed) {

    try {
      const HD_PATH = "m/44'/396'/0'/0/0"
      this.keyPair = await this.client.crypto.mnemonicDeriveSignKeys({
                  dictionary: 1,
                  wordCount: 12,
                  phrase: seed,
                  path: HD_PATH
              })

      console.log(`Tonos-compatible key pair:`)
      console.log(this.keyPair)
    } catch (e) {
      throw Error('Invalid seed phrase')
    }

    this.address = address
    this.seed = seed

    try {
      const output = await this.runGetMethod('getCustodians')
      for (let c in output.custodians) {
        const custodian = output.custodians[c].pubkey
        console.log('custodian', custodian)
        if (BigInteger('0x' + this.keyPair.public).compare(custodian) === 0) {
          console.log('found custodian')
          return
        }
      }
    } catch (e) {
      throw Error('Cannot get account state')
    }
    throw Error('No such custodian')
  }

  /**
   * @returns {string}
   */
  getAddress() {
    return this.address
  }

  /**
   * 
   * @param {string|number} value Value to send in TON nanoCRYSTALS
   * @param {string} destAddress Destination address
   * @param {string} payload BOC payload
   */
  async transact(value, destAddress, payload='') {
    /*
    tonos-cli call <multisig_address> submitTransaction 
    '{"dest":"raw_address","value":<nanotokens>
    "bounce":true,"allBalance":false,"payload":""}' --abi <MultisigWallet.abi.json> --sign <seed_or_keyfile>
    */
    const res = await this.runSmcMethod('submitTransaction',
      {
        dest: destAddress,
        value,
        bounce: true,
        allBalance: false,
        payload: payload
      },
      this.keyPair)
    const output = {
      'transaction_id': res.transaction.id,
      'fees': res.fees.totalAccountFees,
      'output': res.fees.totalOutput
    }
    return output
  }

  async getAccount(address) {
    address = address || this.address
    const res = await this.client.contracts.getAccount(address, true)
    console.log('getAccount', res)
    return res
  }

}

module.exports = Wallet