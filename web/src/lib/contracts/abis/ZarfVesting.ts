export const ZarfVestingABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "_token", "type": "address" },
            { "internalType": "address", "name": "_verifier", "type": "address" },
            { "internalType": "address", "name": "_jwkRegistry", "type": "address" }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    { "inputs": [], "name": "AllocationAlreadySet", "type": "error" },
    { "inputs": [], "name": "InvalidAllocation", "type": "error" },
    { "inputs": [], "name": "InvalidMerkleRoot", "type": "error" },
    { "inputs": [], "name": "InvalidProof", "type": "error" },
    { "inputs": [], "name": "InvalidPubkey", "type": "error" },
    { "inputs": [], "name": "InvalidRecipient", "type": "error" },
    { "inputs": [], "name": "NothingToClaim", "type": "error" },
    { "inputs": [], "name": "TransferFailed", "type": "error" },
    { "inputs": [], "name": "Unauthorized", "type": "error" },
    { "inputs": [], "name": "VestingNotStarted", "type": "error" },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "emailHash", "type": "bytes32" },
            { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "AllocationSet",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "emailHash", "type": "bytes32" },
            { "indexed": true, "internalType": "address", "name": "recipient", "type": "address" },
            { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "Claimed",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "Deposited",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": false, "internalType": "bytes32", "name": "merkleRoot", "type": "bytes32" }
        ],
        "name": "MerkleRootSet",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": false, "internalType": "uint256", "name": "startTime", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "cliffDuration", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "vestingDuration", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "vestingPeriod", "type": "uint256" }
        ],
        "name": "VestingStarted",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "PUBKEY_LIMBS",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
        "name": "allocations",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "bytes32", "name": "emailHash", "type": "bytes32" }],
        "name": "calculateVested",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "bytes", "name": "proof", "type": "bytes" },
            { "internalType": "bytes32[]", "name": "publicInputs", "type": "bytes32[]" }
        ],
        "name": "claim",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
        "name": "claimed",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "cliffDuration",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }],
        "name": "deposit",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "bytes32", "name": "emailHash", "type": "bytes32" }],
        "name": "getClaimable",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getVestingInfo",
        "outputs": [
            { "internalType": "uint256", "name": "start", "type": "uint256" },
            { "internalType": "uint256", "name": "cliff", "type": "uint256" },
            { "internalType": "uint256", "name": "duration", "type": "uint256" },
            { "internalType": "uint256", "name": "period", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getUnlockProgress",
        "outputs": [
            { "internalType": "uint256", "name": "completed", "type": "uint256" },
            { "internalType": "uint256", "name": "total", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "jwkRegistry",
        "outputs": [{ "internalType": "contract JWKRegistry", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "merkleRoot",
        "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "bytes32", "name": "emailHash", "type": "bytes32" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "setAllocation",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "bytes32[]", "name": "emailHashes", "type": "bytes32[]" },
            { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
        ],
        "name": "setAllocations",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "bytes32", "name": "_merkleRoot", "type": "bytes32" }],
        "name": "setMerkleRoot",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "_cliffDuration", "type": "uint256" },
            { "internalType": "uint256", "name": "_vestingDuration", "type": "uint256" },
            { "internalType": "uint256", "name": "_vestingPeriod", "type": "uint256" }
        ],
        "name": "startVesting",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "token",
        "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
        "name": "transferOwnership",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "verifier",
        "outputs": [{ "internalType": "contract IVerifier", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "vestingDuration",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "vestingStart",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "vestingPeriod",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

export const ZarfVestingBytecode = "0x608060405234801561000f575f5ffd5b506004361061011b575f3560e01c80631514617e1461011f578063254800d41461013b57806328d5ffcf146101445780632b7ac3f3146101835780632eb4a7ab146101aa5780633d029091146101b35780635d9ffd02146101c85780636f7c8390146101db5780637313ee5a146101ee5780637cb64759146101f75780638923586d1461020a5780638a94401e1461021d5780638af2c324146102255780638da5cb5b14610238578063b6b55f251461024a578063cc3c0f061461025d578063cd4a54881461027c578063d85349f71461029b578063dc25a300146102a4578063e857bb9a146102c0578063f2fde38b146102d3578063fc0c546a146102e6578063ff5f1e911461030d575b5f5ffd5b61012860045481565b6040519081526020015b60405180910390f35b61012860025481565b61016b7f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b039091168152602001610132565b61016b7f000000000000000000000000000000000000000000000000000000000000000081565b61012860015481565b6101c66101c1366004610d2d565b61032a565b005b6101c66101d6366004610d9d565b61043f565b6101286101e9366004610e07565b610597565b61012860055481565b6101c6610205366004610e07565b6105be565b6101c6610218366004610e1e565b610622565b610128601281565b6101c6610233366004610e9b565b6109d1565b5f5461016b906001600160a01b031681565b6101c6610258366004610e07565b610a57565b61012861026b366004610e07565b60076020525f908152604090205481565b61012861028a366004610e07565b60066020525f908152604090205481565b61012860035481565b6002546003546004546005546040516101329493929190610ebb565b6101286102ce366004610e07565b610b6d565b6101c66102e1366004610ed6565b610c43565b61016b7f000000000000000000000000000000000000000000000000000000000000000081565b610315610c8d565b60408051928352602083019190915201610132565b5f546001600160a01b03163314610353576040516282b42960e81b815260040160405180910390fd5b5f811161039c5760405162461bcd60e51b81526020600482015260126024820152710506572696f64206d757374206265203e20360741b60448201526064015b60405180910390fd5b808210156103e95760405162461bcd60e51b815260206004820152601a602482015279111d5c985d1a5bdb881b5d5cdd081899480f8f481c195c9a5bd960321b6044820152606401610393565b4260028190556003849055600483905560058290556040517f40cfd7cbbf8aae4d4aff9ed9011410e75ba8042410661b56c450666d482181e79161043291869086908690610ebb565b60405180910390a1505050565b5f546001600160a01b03163314610468576040516282b42960e81b815260040160405180910390fd5b8281146104a95760405162461bcd60e51b815260206004820152600f60248201526e098cadccee8d040dad2e6dac2e8c6d608b1b6044820152606401610393565b5f5b83811015610590578282828181106104c5576104c5610f03565b905060200201355f036104eb576040516305d7ba1960e11b815260040160405180910390fd5b8282828181106104fd576104fd610f03565b9050602002013560065f87878581811061051957610519610f03565b9050602002013581526020019081526020015f208190555084848281811061054357610543610f03565b905060200201355f5160206110095f395f51905f5284848481811061056a5761056a610f03565b9050602002013560405161058091815260200190565b60405180910390a26001016104ab565b5050505050565b5f818152600760205260408120546105ae83610b6d565b6105b89190610f2b565b92915050565b5f546001600160a01b031633146105e7576040516282b42960e81b815260040160405180910390fd5b60018190556040518181527f42cbc405e4dbf1b691e85b9a34b08ecfcf7a9ad9078bf4d645ccfa1fac11c10b9060200160405180910390a150565b6002545f03610644576040516306aa937d60e31b815260040160405180910390fd5b604051633a94343960e21b81526001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000169063ea50d0e490610696908790879087908790600401610f3e565b602060405180830381865afa1580156106b1573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906106d59190610fa0565b6106f2576040516309bde33960e01b815260040160405180910390fd5b5f6040515f5b6012811015610715576020810285810135908301526001016106f8565b506102409020604051633a0292bd60e21b8152600481018290529091507f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03169063e80a4af490602401602060405180830381865afa158015610781573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906107a59190610fa0565b6107c25760405163422cc3b760e01b815260040160405180910390fd5b5f838360128181106107d6576107d6610f03565b9050602002013590505f8484601260016107f09190610fbf565b8181106107ff576107ff610f03565b9050602002013590505f8585601260026108199190610fbf565b81811061082857610828610f03565b905060200201359050600154831461085357604051639dd854d360e01b815260040160405180910390fd5b33811461087357604051634e46966960e11b815260040160405180910390fd5b5f61087d83610b6d565b5f84815260076020526040812054919250906108999083610f2b565b9050805f036108bb576040516312d37ee560e31b815260040160405180910390fd5b5f84815260076020526040812080548392906108d8908490610fbf565b909155505060405163a9059cbb60e01b8152336004820152602481018290525f907f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03169063a9059cbb906044016020604051808303815f875af1158015610949573d5f5f3e3d5ffd5b505050506040513d601f19601f8201168201806040525081019061096d9190610fa0565b90508061098d576040516312171d8360e31b815260040160405180910390fd5b604051828152339086907f0508a8b4117d9a7b3d8f5895f6413e61b4f9a2df35afbfb41e78d0ecfff1843f9060200160405180910390a35050505050505050505050565b5f546001600160a01b031633146109fa576040516282b42960e81b815260040160405180910390fd5b805f03610a1a576040516305d7ba1960e11b815260040160405180910390fd5b5f82815260066020526040908190208290555182905f5160206110095f395f51905f5290610a4b9084815260200190565b60405180910390a25050565b5f546001600160a01b03163314610a80576040516282b42960e81b815260040160405180910390fd5b6040516323b872dd60e01b8152336004820152306024820152604481018290525f907f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316906323b872dd906064016020604051808303815f875af1158015610af2573d5f5f3e3d5ffd5b505050506040513d601f19601f82011682018060405250810190610b169190610fa0565b905080610b36576040516312171d8360e31b815260040160405180910390fd5b6040518281527f2a89b2e3d580398d6dc2db5e0f336b52602bbaa51afa9bb5cdf59239cf0d2bea9060200160405180910390a15050565b5f81815260066020526040812054808203610b8a57505f92915050565b6002545f03610b9b57505f92915050565b5f60025442610baa9190610f2b565b9050600354811015610bbf57505f9392505050565b600454600354610bcf9190610fbf565b8110610bdc575092915050565b5f60035482610beb9190610f2b565b90505f60055482610bfc9190610fd2565b90505f600554600454610c0f9190610fd2565b9050805f03610c2357509295945050505050565b80610c2e8387610ff1565b610c389190610fd2565b979650505050505050565b5f546001600160a01b03163314610c6c576040516282b42960e81b815260040160405180910390fd5b5f80546001600160a01b0319166001600160a01b0392909216919091179055565b5f5f6002545f1480610c9f5750600554155b15610cac57505f91829150565b5f60025442610cbb9190610f2b565b9050600354811015610ce1575f600554600454610cd89190610fd2565b92509250509091565b5f60035482610cf09190610f2b565b90505f60055482610d019190610fd2565b90505f600554600454610d149190610fd2565b905080821115610d22578091505b909590945092505050565b5f5f5f60608486031215610d3f575f5ffd5b505081359360208301359350604090920135919050565b5f5f83601f840112610d66575f5ffd5b5081356001600160401b03811115610d7c575f5ffd5b6020830191508360208260051b8501011115610d96575f5ffd5b9250929050565b5f5f5f5f60408587031215610db0575f5ffd5b84356001600160401b03811115610dc5575f5ffd5b610dd187828801610d56565b90955093505060208501356001600160401b03811115610def575f5ffd5b610dfb87828801610d56565b95989497509550505050565b5f60208284031215610e17575f5ffd5b5035919050565b5f5f5f5f60408587031215610e31575f5ffd5b84356001600160401b03811115610e46575f5ffd5b8501601f81018713610e56575f5ffd5b80356001600160401b03811115610e6b575f5ffd5b876020828401011115610e7c575f5ffd5b6020918201955093508501356001600160401b03811115610def575f5ffd5b5f5f60408385031215610eac575f5ffd5b50508035926020909101359150565b93845260208401929092526040830152606082015260800190565b5f60208284031215610ee6575f5ffd5b81356001600160a01b0381168114610efc575f5ffd5b9392505050565b634e487b7160e01b5f52603260045260245ffd5b634e487b7160e01b5f52601160045260245ffd5b818103818111156105b8576105b8610f17565b60408152836040820152838560608301375f60608583018101829052601f19601f8701168301838103820160208501529081018490526001600160fb1b03841115610f87575f5ffd5b8360051b80866080840137016080019695505050505050565b5f60208284031215610fb0575f5ffd5b81518015158114610efc575f5ffd5b808201808211156105b8576105b8610f17565b5f82610fec57634e487b7160e01b5f52601260045260245ffd5b500490565b80820281158282048414176105b8576105b8610f1756fe2b4f0fd37387c4f7071122e4a8de510e0ac43fec59dd9618013ae215abf558d1a264697066735822122047b0d6a4e968f8ba5090866c34597fbe57ea89d601d8a0b50b7416686f63f66764736f6c634300081c0033" as const;
