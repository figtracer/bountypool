-include .env

build :; forge build

NETWORK_ARGS = --rpc-url $(ANVIL_RPC_URL) --account anvilKey --sender 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --broadcast

deploy-anvil:
	forge script script/Deploy.s.sol:Deploy $(NETWORK_ARGS) -vvvv

get-apy:
	forge script script/GetAaveAPY.s.sol:GetAaveAPY $(NETWORK_ARGS) --via-ir -vvvv
