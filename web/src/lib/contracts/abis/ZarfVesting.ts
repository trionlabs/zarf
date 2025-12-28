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
            { "indexed": false, "internalType": "uint256", "name": "vestingDuration", "type": "uint256" }
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
            { "internalType": "uint256", "name": "duration", "type": "uint256" }
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
            { "internalType": "uint256", "name": "_vestingDuration", "type": "uint256" }
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
    }
] as const;

export const ZarfVestingBytecode = "0x608060405234801561000f575f5ffd5b5060043610610105575f3560e01c80631514617e14610109578063254800d41461012557806328d5ffcf1461012e5780632b7ac3f31461016d5780632eb4a7ab146101945780635d9ffd021461019d5780636f7c8390146101b25780637cb64759146101c55780638923586d146101d85780638a94401e146101eb5780638af2c324146101f35780638da5cb5b14610206578063b6b55f2514610218578063bf85e6281461022b578063cc3c0f061461023e578063cd4a54881461025d578063d85349f71461027c578063dc25a30014610285578063e857bb9a1461029d578063f2fde38b146102b0578063fc0c546a146102c3575b5f5ffd5b61011260045481565b6040519081526020015b60405180910390f35b61011260025481565b6101557f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b03909116815260200161011c565b6101557f000000000000000000000000000000000000000000000000000000000000000081565b61011260015481565b6101b06101ab366004610bba565b6102ea565b005b6101126101c0366004610c24565b610446565b6101b06101d3366004610c24565b61046d565b6101b06101e6366004610c3b565b6104d1565b610112601281565b6101b0610201366004610cb8565b610880565b5f54610155906001600160a01b031681565b6101b0610226366004610c24565b610906565b6101b0610239366004610cb8565b610a1d565b61011261024c366004610c24565b60066020525f908152604090205481565b61011261026b366004610c24565b60056020525f908152604090205481565b61011260035481565b60025460035460045460405161011c93929190610cd8565b6101126102ab366004610c24565b610a88565b6101b06102be366004610cee565b610b29565b6101557f000000000000000000000000000000000000000000000000000000000000000081565b5f546001600160a01b03163314610313576040516282b42960e81b815260040160405180910390fd5b8281146103585760405162461bcd60e51b815260206004820152600f60248201526e098cadccee8d040dad2e6dac2e8c6d608b1b604482015260640160405180910390fd5b5f5b8381101561043f5782828281811061037457610374610d1b565b905060200201355f0361039a576040516305d7ba1960e11b815260040160405180910390fd5b8282828181106103ac576103ac610d1b565b9050602002013560055f8787858181106103c8576103c8610d1b565b9050602002013581526020019081526020015f20819055508484828181106103f2576103f2610d1b565b905060200201355f516020610e215f395f51905f5284848481811061041957610419610d1b565b9050602002013560405161042f91815260200190565b60405180910390a260010161035a565b5050505050565b5f8181526006602052604081205461045d83610a88565b6104679190610d43565b92915050565b5f546001600160a01b03163314610496576040516282b42960e81b815260040160405180910390fd5b60018190556040518181527f42cbc405e4dbf1b691e85b9a34b08ecfcf7a9ad9078bf4d645ccfa1fac11c10b9060200160405180910390a150565b6002545f036104f3576040516306aa937d60e31b815260040160405180910390fd5b604051633a94343960e21b81526001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000169063ea50d0e490610545908790879087908790600401610d56565b602060405180830381865afa158015610560573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906105849190610db8565b6105a1576040516309bde33960e01b815260040160405180910390fd5b5f6040515f5b60128110156105c4576020810285810135908301526001016105a7565b506102409020604051633a0292bd60e21b8152600481018290529091507f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03169063e80a4af490602401602060405180830381865afa158015610630573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906106549190610db8565b6106715760405163422cc3b760e01b815260040160405180910390fd5b5f8383601281811061068557610685610d1b565b9050602002013590505f84846012600161069f9190610dd7565b8181106106ae576106ae610d1b565b9050602002013590505f8585601260026106c89190610dd7565b8181106106d7576106d7610d1b565b905060200201359050600154831461070257604051639dd854d360e01b815260040160405180910390fd5b33811461072257604051634e46966960e11b815260040160405180910390fd5b5f61072c83610a88565b5f84815260066020526040812054919250906107489083610d43565b9050805f0361076a576040516312d37ee560e31b815260040160405180910390fd5b5f8481526006602052604081208054839290610787908490610dd7565b909155505060405163a9059cbb60e01b8152336004820152602481018290525f907f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03169063a9059cbb906044016020604051808303815f875af11580156107f8573d5f5f3e3d5ffd5b505050506040513d601f19601f8201168201806040525081019061081c9190610db8565b90508061083c576040516312171d8360e31b815260040160405180910390fd5b604051828152339086907f0508a8b4117d9a7b3d8f5895f6413e61b4f9a2df35afbfb41e78d0ecfff1843f9060200160405180910390a35050505050505050505050565b5f546001600160a01b031633146108a9576040516282b42960e81b815260040160405180910390fd5b805f036108c9576040516305d7ba1960e11b815260040160405180910390fd5b5f82815260056020526040908190208290555182905f516020610e215f395f51905f52906108fa9084815260200190565b60405180910390a25050565b5f546001600160a01b0316331461092f576040516282b42960e81b815260040160405180910390fd5b6040516323b872dd60e01b8152336004820152306024820152604481018290525f907f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316906323b872dd906064016020604051808303815f875af11580156109a1573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906109c59190610db8565b9050806109e5576040516312171d8360e31b815260040160405180910390fd5b6040518281527f2a89b2e3d580398d6dc2db5e0f336b52602bbaa51afa9bb5cdf59239cf0d2bea906020015b60405180910390a15050565b5f546001600160a01b03163314610a46576040516282b42960e81b815260040160405180910390fd5b426002819055600383905560048290556040517f65ea327738ef00d189846de71da130b6b863a715475fef1007cfcdebe901c9c391610a119185908590610cd8565b5f81815260056020526040812054808203610aa557505f92915050565b6002545f03610ab657505f92915050565b5f60025442610ac59190610d43565b9050600354811015610ada57505f9392505050565b600454600354610aea9190610dd7565b8110610af7575092915050565b5f60035482610b069190610d43565b600454909150610b168285610dea565b610b209190610e01565b95945050505050565b5f546001600160a01b03163314610b52576040516282b42960e81b815260040160405180910390fd5b5f80546001600160a01b0319166001600160a01b0392909216919091179055565b5f5f83601f840112610b83575f5ffd5b5081356001600160401b03811115610b99575f5ffd5b6020830191508360208260051b8501011115610bb3575f5ffd5b9250929050565b5f5f5f5f60408587031215610bcd575f5ffd5b84356001600160401b03811115610be2575f5ffd5b610bee87828801610b73565b90955093505060208501356001600160401b03811115610c0c575f5ffd5b610c1887828801610b73565b95989497509550505050565b5f60208284031215610c34575f5ffd5b5035919050565b5f5f5f5f60408587031215610c4e575f5ffd5b84356001600160401b03811115610c63575f5ffd5b8501601f81018713610c73575f5ffd5b80356001600160401b03811115610c88575f5ffd5b876020828401011115610c99575f5ffd5b6020918201955093508501356001600160401b03811115610c0c575f5ffd5b5f5f60408385031215610cc9575f5ffd5b50508035926020909101359150565b9283526020830191909152604082015260600190565b5f60208284031215610cfe575f5ffd5b81356001600160a01b0381168114610d14575f5ffd5b9392505050565b634e487b7160e01b5f52603260045260245ffd5b634e487b7160e01b5f52601160045260245ffd5b8181038181111561046757610467610d2f565b60408152836040820152838560608301375f60608583018101829052601f19601f8701168301838103820160208501529081018490526001600160fb1b03841115610d9f575f5ffd5b8360051b80866080840137016080019695505050505050565b5f60208284031215610dc8575f5ffd5b81518015158114610d14575f5ffd5b8082018082111561046757610467610d2f565b808202811582820484141761046757610467610d2f565b5f82610e1b57634e487b7160e01b5f52601260045260245ffd5b50049056fe2b4f0fd37387c4f7071122e4a8de510e0ac43fec59dd9618013ae215abf558d1a2646970667358221220c570a48c83552367ae9f6366767a57870c9b9355a17d93aeca252517da7f381a64736f6c634300081c0033" as const;
