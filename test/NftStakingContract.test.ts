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

    nftStakingContract.connect(address1).allowlistMint(proof, 1, {
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

  // this test requires _randomNumbers array to be initialized
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

  it("Should shuffle _randomNumbers array such that tokenURI function returns a different URI after shuffler is run", async () => {
    const randomSeed = ethers.BigNumber.from("7854166079704491"); // this can be supplied off chain or via chainliink vrf

    nftStakingContract.setPublicMintActive(true);

    await expect(
      nftStakingContract.publicMint(1, {
        value: ethers.utils.parseEther(".08"),
      })
    );

    await nftStakingContract.setIsRevealed(true);

    const tokenURI = await nftStakingContract.tokenURI(0);

    const oldArray = await nftStakingContract.getRandomNumbersArray();

    await nftStakingContract.shuffler(randomSeed);

    const newTokenURI = await nftStakingContract.tokenURI(0);

    const newArray = await nftStakingContract.getRandomNumbersArray();

    oldArray.forEach((e: number) => {
      expect(e).to.not.equal(newArray[e - 1]);
    });

    expect(tokenURI).to.not.equal(newTokenURI);
  });

  it("Should refund such that owner receives eth and no longer owns token, refund_address now has token", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    const balanceBefore = await ethers.provider.getBalance(address1.address);

    await nftStakingContract.setRefundActive(true);

    await nftStakingContract.connect(address1).refund(address1.address, 0);

    const balanceAfter = await ethers.provider.getBalance(address1.address);

    // Asserts that after refund the current owner of token minted by address1 is daoAddress
    expect(await nftStakingContract.ownerOf(0)).to.equal(
      await nftStakingContract.daoAddress()
    );

    // Asserts that balanceBefore - balanceAfter is at least price * 2*adminPercentage
    expect(
      parseFloat(ethers.utils.formatEther(balanceAfter)) -
        parseFloat(ethers.utils.formatEther(balanceBefore))
    ).to.be.greaterThan(
      parseFloat(
        ethers.utils.formatEther(await nftStakingContract.itemPricePublic())
      ) *
        // Double admin fee is to account for gas spend during txns
        ((100 - 2 * (await nftStakingContract.adminPercentage())) / 100)
    );
  });

  it("Should not allow refund when refund period is not active", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await expect(
      nftStakingContract.connect(address1).refund(address1.address, 0)
    ).to.be.revertedWith("RefundPeriodNotActive");
  });

  it("Should not allow refund to be called by address that does not own token", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await nftStakingContract.setRefundActive(true);

    await expect(
      nftStakingContract.connect(address2).refund(address1.address, 0)
    ).to.be.revertedWith("RefundCallerNotOwner");
  });

  it("Should not allow refund to be called on token that has already been refunded", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await nftStakingContract.setRefundActive(true);

    await nftStakingContract.connect(address1).refund(address1.address, 0);

    await expect(
      nftStakingContract.refund(owner.address, 0)
    ).to.be.revertedWith("TokenHasAlreadyBeenRefunded");
  });

  it("Should not allow refund for free/internal/reserved mints", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.internalMint(1);

    await nftStakingContract.setRefundActive(true);

    await expect(
      nftStakingContract.refund(owner.address, 0)
    ).to.be.revertedWith("TokenWasFreeMin");
  });

  /*

  New Tests to add to Complete Refund Mechanism

  1)  Test _tokenData's ability to hold multiple prices

  */

  it("Should refund the correct amount regardless of mint price", async () => {
    /*     
      PUBLIC MINT/REFUND BLOCK
    */
    nftStakingContract.setPublicMintActive(true);
    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });
    const balanceBeforeAdd1 = await ethers.provider.getBalance(
      address1.address
    );
    await nftStakingContract.setRefundActive(true);
    await nftStakingContract.connect(address1).refund(address1.address, 0);
    const balanceAfterAdd1 = await ethers.provider.getBalance(address1.address);
    /*
      END PUBLIC BLOCK
    */
    /*
      ALLOWLIST MINT/REFUND BLOCK
    */
    nftStakingContract.setAllowlistMintActive(true);
    const leaf = keccak256(address2.address);
    const proof = tree.getHexProof(leaf);
    await nftStakingContract.connect(address2).allowlistMint(proof, 1, {
      value: ethers.utils.parseEther(".06"),
    });
    const balanceBeforeAdd2 = await ethers.provider.getBalance(
      address2.address
    );

    await nftStakingContract.connect(address2).refund(address2.address, 1);
    const balanceAfterAdd2 = await ethers.provider.getBalance(address2.address);
    /*
      END ALLOWLIST BLOCK
    */
    /*
      ASSERTIONS BLOCK
    */
    // Asserts that after refund the current owner of tokens minted is daoAddress
    expect(await nftStakingContract.ownerOf(0)).to.equal(
      await nftStakingContract.daoAddress()
    );

    expect(await nftStakingContract.ownerOf(1)).to.equal(
      await nftStakingContract.daoAddress()
    );

    // Asserts that balanceBefore - balanceAfter is at least price * 2*adminPercentage - Public Mint Example
    expect(
      parseFloat(ethers.utils.formatEther(balanceAfterAdd1)) -
        parseFloat(ethers.utils.formatEther(balanceBeforeAdd1))
    ).to.be.greaterThan(
      parseFloat(
        ethers.utils.formatEther(await nftStakingContract.itemPricePublic())
      ) *
        // Double admin fee is to account for gas spend during txns
        ((100 - 2 * (await nftStakingContract.adminPercentage())) / 100)
    );

    // Asserts that balanceBefore - balanceAfter is at least price * 2*adminPercentage - Allowlist Mint Example
    expect(
      parseFloat(ethers.utils.formatEther(balanceAfterAdd2)) -
        parseFloat(ethers.utils.formatEther(balanceBeforeAdd2))
    ).to.be.greaterThan(
      parseFloat(
        ethers.utils.formatEther(await nftStakingContract.itemPriceAl())
      ) *
        // Double admin fee is to account for gas spend during txns
        ((100 - 2 * (await nftStakingContract.adminPercentage())) / 100)
    );
  });

  it("Should not allow p2p transfers by default", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await expect(
      nftStakingContract
        .connect(address1)
        .transferFrom(address1.address, address2.address, 0)
    ).to.be.revertedWith("AllTransfersHaveBeenDisabled");
  });

  it("Should allow p2p transfers when allTransfersDisabled is set to false", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await nftStakingContract.setAllTransfersDisabled(false);

    await nftStakingContract
      .connect(address1)
      .transferFrom(address1.address, address2.address, 0);

    expect(await nftStakingContract.ownerOf(0)).to.equal(address2.address);
  });

  it("Should allow DAO to take NFT after public mint", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await nftStakingContract.transferFrom(
      address1.address,
      await nftStakingContract.daoAddress(),
      0
    );

    expect(await nftStakingContract.ownerOf(0)).to.equal(
      await nftStakingContract.daoAddress()
    );
  });

  it("Should allow DAO to take NFT after allowlist mint", async () => {
    const leaf = keccak256(address1.address);
    const proof = tree.getHexProof(leaf);

    nftStakingContract.setAllowlistMintActive(true);

    await nftStakingContract.connect(address1).allowlistMint(proof, 1, {
      value: ethers.utils.parseEther(".06"),
    });

    await nftStakingContract.transferFrom(
      address1.address,
      await nftStakingContract.daoAddress(),
      0
    );

    expect(await nftStakingContract.ownerOf(0)).to.equal(
      await nftStakingContract.daoAddress()
    );
  });

  it("Should allow DAO to take NFT if DAO address is changed", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await nftStakingContract.setDaoAddress(address2.address);

    await nftStakingContract.transferFrom(
      address1.address,
      await nftStakingContract.daoAddress(),
      0
    );

    expect(await nftStakingContract.ownerOf(0)).to.equal(address2.address);
  });

  it("Should not allow more than 1 NFT per mint", async () => {
    nftStakingContract.setPublicMintActive(true);

    await expect(
      nftStakingContract.publicMint(2, {
        value: ethers.utils.parseEther(".16"),
      })
    ).to.be.revertedWith("TooManyNFTsInSingleTx");
  });

  it("Should not allow any address to have more than one NFT at a time even when transfers are on", async () => {
    nftStakingContract.setPublicMintActive(true);

    await nftStakingContract.connect(address1).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await nftStakingContract.connect(address2).publicMint(1, {
      value: ethers.utils.parseEther(".08"),
    });

    await nftStakingContract.setAllTransfersDisabled(false);

    await expect(
      nftStakingContract
        .connect(address1)
        .transferFrom(address1.address, address2.address, 0)
    ).to.be.revertedWith("OnlyOneTokenPerAddress");
  });
});
