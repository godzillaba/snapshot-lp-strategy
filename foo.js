const fetch = require('node-fetch');
const ethers = require('ethers');
const Web3 = require('web3');
const fs = require('fs');
const web3 = new Web3(new Web3.providers.HttpProvider("https://polygon-mainnet.infura.io/v3/25a04237edaa4aaebffda3c53ce4cf6d"));


const POLYGONSCAN_API_KEY = "IV7ZFBB1SH3DKM6QB3435K3X4XZF2NQECW";
const TEL_ADDRESS = "0xdf7837de1f2fa4631d716cf2502f8b230f1dcc32";

const MY_ADDRESS = "0x1355fEBa6C34263E75A89b1A72928239EDcbf6e1";



async function getContractInstance(address) {
    let res = await fetch(`https://api.polygonscan.com/api?module=contract&action=getabi&address=${address}&apikey=${POLYGONSCAN_API_KEY}`);
    let abi = (await res.json()).result;
    let MC = new web3.eth.Contract(JSON.parse(abi), address);
    return MC;
}


class Contract {
    telAddress; // address
    balancerStakingContracts = []; // address[]
    quickswapStakingContracts = []; // address[]

    constructor(_telAddress) {
        this.telAddress = _telAddress;
    }

    addStakingRewardsContract(address, dex) {
        // dex is either quickswap or balancer
        if (dex === 'balancer') {
            this.balancerStakingContracts.push(address);
        }
        else if (dex === 'quickswap') {
            this.quickswapStakingContracts.push(address);
        }
        else {
            // revert
            throw new Error("revert: invalid dex type");
        }
    }

    removeStakingRewardsContract(i, dex) {
        // TODO
    }

    async getLpValue(addy) {
        // loop balancer staking contracts
        let telForThisUser = ethers.BigNumber.from('0');
        
        for (let i = 0; i < this.balancerStakingContracts.length; i++) {
            let stakingContractInstance = await getContractInstance(this.balancerStakingContracts[i]);
            let stakingToken = await getContractInstance(await stakingContractInstance.methods.stakingToken().call());
            let unstakedBalance = ethers.BigNumber.from(await stakingToken.methods.balanceOf(addy).call());
            let stakedBalance = ethers.BigNumber.from(await stakingContractInstance.methods.balanceOf(addy).call());

            let totalBalance = unstakedBalance.add(stakedBalance);
            let totalSupply = ethers.BigNumber.from(await stakingToken.methods.totalSupply().call());

            let poolId = await stakingToken.methods.getPoolId().call();
            let vaultAddress = await stakingToken.methods.getVault().call();
            let vaultContract = await getContractInstance(vaultAddress);

            let telInPool = ethers.BigNumber.from((await vaultContract.methods.getPoolTokenInfo(poolId, this.telAddress).call())[0]);

            let myShare = telInPool.mul(totalBalance).div(totalSupply);

            telForThisUser = telForThisUser.add(myShare);
        }

        // loop over quickswap contracts
        for (let i = 0; i < this.quickswapStakingContracts.length; i++) {
            let stakingContractInstance = await getContractInstance(this.quickswapStakingContracts[i]);
            let stakingToken = await getContractInstance(await stakingContractInstance.methods.stakingToken().call());
            let unstakedBalance = ethers.BigNumber.from(await stakingToken.methods.balanceOf(addy).call());
            let stakedBalance = ethers.BigNumber.from(await stakingContractInstance.methods.balanceOf(addy).call());

            let totalBalance = unstakedBalance.add(stakedBalance);
            let totalSupply = ethers.BigNumber.from(await stakingToken.methods.totalSupply().call());

            let reserves;
            if ((await stakingToken.methods.token0().call()).toLowerCase() === this.telAddress.toLowerCase()) {
                reserves = ethers.BigNumber.from((await stakingToken.methods.getReserves().call())[0]);
            }
            else if ((await stakingToken.methods.token1().call()).toLowerCase() === this.telAddress.toLowerCase()) {
                reserves = ethers.BigNumber.from((await stakingToken.methods.getReserves().call())[1]);
            }
            else {
                // revert
                throw new Error("this pool doesn't have tel: " + this.quickswapStakingContracts[i]);
            }

            let myShare = reserves.mul(totalBalance).div(totalSupply)
            telForThisUser = telForThisUser.add(myShare)
        }


        return telForThisUser;
    } 
}

(async() => {
    let contract = new Contract(TEL_ADDRESS);
    contract.addStakingRewardsContract("0xefC6d17276C640169b352B37226949f5Eab35384", "balancer")
    contract.addStakingRewardsContract("0xEda437364DCF8AB00f07b49bCc213CDf356b3962", "quickswap")
    console.log(await contract.getLpValue(MY_ADDRESS) - 0)
})();