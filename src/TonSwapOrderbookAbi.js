
const TonSwapOrderbookAbi = {
	"ABI version": 2,
	"header": ["time"],
	"functions": [
		{
			"name": "constructor",
			"inputs": [
				{"name":"ethSmcAddress","type":"uint256"},
				{"name":"ethTokenSmcAddress","type":"uint256"}
			],
			"outputs": [
			]
		},
		{
			"name": "withdraw",
			"inputs": [
				{"name":"amount","type":"uint256"}
			],
			"outputs": [
			]
		},
		{
			"name": "getBalance",
			"inputs": [
				{"name":"participant","type":"address"}
			],
			"outputs": [
				{"components":[{"name":"value","type":"uint256"},{"name":"inOrders","type":"uint256"},{"name":"locked","type":"uint256"}],"name":"balance","type":"tuple"}
			]
		},
		{
			"name": "getEthSmcAddress",
			"inputs": [
			],
			"outputs": [
				{"name":"ethSmcAddress","type":"uint256"}
			]
		},
		{
			"name": "getEthTokenSmcAddress",
			"inputs": [
			],
			"outputs": [
				{"name":"ethTokenSmcAddress","type":"uint256"}
			]
		},
		{
			"name": "createDirectOrder",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"value","type":"uint256"},
				{"name":"minValue","type":"uint256"},
				{"name":"exchangeRate","type":"uint256"},
				{"name":"timeLockSlot","type":"uint32"},
				{"name":"secretHash","type":"uint256"},
				{"name":"initiatorTargetAddress","type":"bytes[]"}
			],
			"outputs": [
			]
		},
		{
			"name": "deleteDirectOrder",
			"inputs": [
				{"name":"dbId","type":"uint32"}
			],
			"outputs": [
			]
		},
		{
			"name": "confirmDirectOrder",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"value","type":"uint256"},
				{"name":"initiatorAddress","type":"address"},
				{"name":"confirmatorSourceAddress","type":"bytes[]"}
			],
			"outputs": [
			]
		},
		{
			"name": "finishDirectOrderWithSecret",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"initiatorAddress","type":"address"},
				{"name":"secret","type":"bytes"}
			],
			"outputs": [
			]
		},
		{
			"name": "finishDirectOrderWithTimeout",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"initiatorAddress","type":"address"}
			],
			"outputs": [
			]
		},
		{
			"name": "createReversedOrder",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"value","type":"uint256"},
				{"name":"minValue","type":"uint256"},
				{"name":"exchangeRate","type":"uint256"},
				{"name":"timeLockSlot","type":"uint32"},
				{"name":"initiatorSourceAddress","type":"bytes[]"}
			],
			"outputs": [
			]
		},
		{
			"name": "deleteReversedOrder",
			"inputs": [
				{"name":"dbId","type":"uint32"}
			],
			"outputs": [
			]
		},
		{
			"name": "confirmReversedOrder",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"value","type":"uint256"},
				{"name":"initiatorAddress","type":"address"},
				{"name":"confirmatorTargetAddress","type":"bytes[]"},
				{"name":"secretHash","type":"uint256"}
			],
			"outputs": [
			]
		},
		{
			"name": "finishReversedOrderWithSecret",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"initiatorAddress","type":"address"},
				{"name":"secret","type":"bytes"}
			],
			"outputs": [
			]
		},
		{
			"name": "finishReversedOrderWithTimeout",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"initiatorAddress","type":"address"}
			],
			"outputs": [
			]
		},
		{
			"name": "calcForeignOutput",
			"inputs": [
				{"name":"value","type":"uint256"},
				{"name":"exchangeRate","type":"uint256"}
			],
			"outputs": [
				{"name":"foreignValue","type":"uint256"}
			]
		},
		{
			"name": "getDirectOrders",
			"inputs": [
				{"name":"dbId","type":"uint32"}
			],
			"outputs": [
				{"name":"orders","type":"address[]"}
			]
		},
		{
			"name": "getReversedOrders",
			"inputs": [
				{"name":"dbId","type":"uint32"}
			],
			"outputs": [
				{"name":"orders","type":"address[]"}
			]
		},
		{
			"name": "getDirectOrder",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"initiatorAddress","type":"address"}
			],
			"outputs": [
				{"components":[{"name":"confirmed","type":"bool"},{"name":"confirmTime","type":"uint32"},{"name":"value","type":"uint256"},{"name":"minValue","type":"uint256"},{"name":"exchangeRate","type":"uint256"},{"name":"timeLockSlot","type":"uint32"},{"name":"secretHash","type":"uint256"},{"name":"initiatorTargetAddress","type":"bytes[]"},{"name":"confirmatorTargetAddress","type":"address"},{"name":"confirmatorSourceAddress","type":"bytes[]"}],"name":"order","type":"tuple"}
			]
		},
		{
			"name": "getReversedOrder",
			"inputs": [
				{"name":"dbId","type":"uint32"},
				{"name":"initiatorAddress","type":"address"}
			],
			"outputs": [
				{"components":[{"name":"confirmed","type":"bool"},{"name":"confirmTime","type":"uint32"},{"name":"foreignValue","type":"uint256"},{"name":"foreignMinValue","type":"uint256"},{"name":"exchangeRate","type":"uint256"},{"name":"timeLockSlot","type":"uint32"},{"name":"initiatorSourceAddress","type":"bytes[]"},{"name":"value","type":"uint256"},{"name":"confirmatorSourceAddress","type":"address"},{"name":"confirmatorTargetAddress","type":"bytes[]"},{"name":"secretHash","type":"uint256"}],"name":"order","type":"tuple"}
			]
		},
		{
			"name": "getHash",
			"inputs": [
				{"name":"secret","type":"bytes"}
			],
			"outputs": [
				{"name":"hash","type":"uint256"}
			]
		}
	],
	"data": [
	],
	"events": [
	]
}




module.exports = TonSwapOrderbookAbi;