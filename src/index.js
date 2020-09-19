const TonSwapOrderbook = require('./TonSwapOrderbook')

if (typeof window !== 'undefined') {
    window.TonSwapOrderbook = TonSwapOrderbook;
}

module.exports = TonSwapOrderbook;