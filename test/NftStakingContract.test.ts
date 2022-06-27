import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import MerkleTree from "merkletreejs";
import keccak256 from "keccak256";
const { web3 } = require("@openzeppelin/test-helpers/src/setup");

describe("NftStakingContract", () => {
  let nftStakingContract: Contract;
  let owner: SignerWithAddress;
  let address1: SignerWithAddress;
  let address2: SignerWithAddress;
  let address3: SignerWithAddress;
  let root: any;
  let tree: MerkleTree;

  beforeEach(async () => {
    const NftStakingContractFactory = await ethers.getContractFactory(
      "NftStakingContract"
    );
    [owner, address1, address2, address3] = await ethers.getSigners();

    const leaves = [owner.address, address1.address, address2.address].map(
      (v) => keccak256(v)
    );
    tree = new MerkleTree(leaves, keccak256, { sort: true });
    root = tree.getHexRoot();

    nftStakingContract = await NftStakingContractFactory.deploy(root);
  });

  it("Should initialize NftStakingContract Contract and check mint price is .08", async () => {
    const inWei = await nftStakingContract.itemPricePublic();
    expect(parseFloat(web3.utils.fromWei(inWei.toString(), "ether"))).to.equal(
      0.08
    );
  });

  it("Should set the right owner", async () => {
    expect(await nftStakingContract.owner()).to.equal(await owner.address);
  });

  it("Should allow allowlisted address to execute allowlist mint using proof, mint address balance should match # of mints executed", async () => {
    const leaf = keccak256(address1.address);
    const proof = tree.getHexProof(leaf);

    nftStakingContract.setAllowlistMintActive(true);

    await nftStakingContract.connect(address1).allowlistMint(proof, 1, {
      value: ethers.utils.parseEther(".06"),
    });

    const balance = await nftStakingContract.balanceOf(address1.address);
    expect(balance.toNumber()).to.equal(1);
  });

  it("Should not allow more allowlist mints than allowlistMintMaxPerTx allows", async () => {
    const leaf = keccak256(owner.address);
    const proof = tree.getHexProof(leaf);

    nftStakingContract.setAllowlistMintActive(true);

    await expect(
      nftStakingContract.allowlistMint(proof, 2, {
        value: ethers.utils.parseEther(".32"),
      })
    ).to.be.revertedWith("IncorrectAmtOfEthForTx");
  });

  it("Should not allow allowlist mints with incorrect payment value", async () => {
    const leaf = keccak256(owner.address);
    const proof = tree.getHexProof(leaf);

    nftStakingContract.setAllowlistMintActive(true);

    await expect(
      nftStakingContract.allowlistMint(proof, 1, {
        value: ethers.utils.parseEther(".1"),
      })
    ).to.be.revertedWith("IncorrectAmtOfEthForTx");
  });

  it("Should not allow allowlist mints with invalid proof/root/leaf", async () => {
    const leaf = keccak256(address3.address); // address3 is not in the merkle tree

    const proof = tree.getHexProof(leaf);

    nftStakingContract.setAllowlistMintActive(true);

    await expect(
      nftStakingContract.allowlistMint(proof, 1, {
        value: ethers.utils.parseEther(".06"),
      })
    ).to.be.revertedWith("InvalidProof");
  });

  it("Should not allow allowlist mint if allowlist mint is not active", async () => {
    const leaf = keccak256(owner.address);
    const proof = tree.getHexProof(leaf);

    await expect(
      nftStakingContract.allowlistMint(proof, 2, {
        value: ethers.utils.parseEther(".12"),
      })
    ).to.be.revertedWith("AllowlistMintNotActive");
  });

  it("Should not allow allowlist mint if # of mints exceeds MAX_TOTAL_TOKENS - internals", async () => {
    const leaf = keccak256(owner.address);
    const proof = tree.getHexProof(leaf);

    nftStakingContract.setAllowlistMintActive(true);

    await expect(
      nftStakingContract.allowlistMint(proof, 3, {
        value: ethers.utils.parseEther(".18"),
      })
    ).to.be.revertedWith("NotEnoughNftsLeftToMint");
  });

  it("Should allow public mint from any address, mint address balance should match # of mints executed, max public mint per tx should not be exceeded", async () => {
    await nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    const balance = await nftStakingContract.balanceOf(owner.address);

    expect(balance.toNumber()).to.equal(1);

    await expect(
      nftStakingContract.publicMint(5, {
        value: ethers.utils.parseEther(".40"),
      })
    ).to.be.reverted;
  });

  it("Should not exceed max public mint per tx #", async () => {
    nftStakingContract.setPublicMintActive(true);

    await expect(
      nftStakingContract.publicMint(2, {
        value: ethers.utils.parseEther(".16"),
      })
    ).to.be.revertedWith("TooManyNFTsInSingleTx");
  });

  it("Should not allow max supply to be exceeded during public mint", async () => {
    nftStakingContract.setPublicMintActive(true);

    nftStakingContract.publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await expect(
      nftStakingContract.connect(address2).publicMint(1, {
        value: ethers.utils.parseEther(".08"),
      })
    ).to.be.revertedWith("NotEnoughNftsLeftToMint");
  });

  it("Should not be allowed to public mint if it is not active", async () => {
    await expect(
      nftStakingContract.publicMint(1, {
        value: ethers.utils.parseEther(".08"),
      })
    ).to.be.revertedWith("PublicMintNotActive");
  });

  it("Should not be allowed to public mint with incorrect payment value", async () => {
    nftStakingContract.setPublicMintActive(true);

    await expect(
      nftStakingContract.publicMint(1, {
        value: ethers.utils.parseEther(".09"),
      })
    ).to.be.revertedWith("IncorrectAmtOfEthForTx");
  });

  it("Should allow internal mint from any address inside internals mapping, mint address balance should match # of mints executed", async () => {
    await expect(nftStakingContract.internalMint(1));

    const balance = await nftStakingContract.balanceOf(owner.address);

    expect(balance.toNumber()).to.equal(1);
  });

  it("Should not exceed allowance # of internal mints", async () => {
    await expect(nftStakingContract.internalMint(2)).to.be.revertedWith(
      "InvalidInternalAmount"
    );
  });

  it("Should return unrevealerdURI if is_revealed === false", async () => {
    nftStakingContract.internalMint(1);

    const testURI = await nftStakingContract.tokenURI(0);

    expect(testURI).to.equal("ipfs://unrevealedURI");
  });

  it("Should not allow tokenURI query for token that has not been minted or does not exist", async () => {
    nftStakingContract.internalMint(1);

    await expect(nftStakingContract.tokenURI(1)).to.be.revertedWith(
      "URIQueryForNonexistentToken"
    );

    await expect(nftStakingContract.tokenURI(10000)).to.be.revertedWith(
      "URIQueryForNonexistentToken"
    );
  });

  it("Should return revealedURI + tokenID + .json if is_revealed === true", async () => {
    nftStakingContract.internalMint(1);

    nftStakingContract.setIsRevealed(true);

    const testURI = await nftStakingContract.tokenURI(0);

    expect(testURI).to.equal("revealedURI.ipfs/0.json");
  });

  it("Any ETH or ERC20 txns should be reverted", async () => {
    await expect(
      address1.sendTransaction({
        to: nftStakingContract.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.revertedWith("ContractDoesNotAllowReceiptOfTokens");
  });

  it("Should not allow more than more mints than PUB_MINT_MAX_PER_TX", async () => {
    nftStakingContract.setPublicMintActive(true);

    await expect(
      nftStakingContract.publicMint(2, {
        value: ethers.utils.parseEther(".16"),
      })
    ).to.be.revertedWith("TooManyNFTsInSingleTx");
  });

  it("Should not allow transfers while staked", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await nftStakingContract.setStakingOpen(true);

    await nftStakingContract.toggleStaking([0]);

    expect(
      await nftStakingContract.transferFrom(owner.address, address1.address, 0)
    ).to.be.revertedWith("Staking Active");
  });
});
