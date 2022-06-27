// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "erc721a/contracts/ERC721A.sol";

import "hardhat/console.sol";

pragma solidity ^0.8.0;

// Error functions - converted form require strings to save memory

error ContractDoesNotAllowReceiptOfTokens();
error AnIncorrectFunctionWasCalled();
error NotEnoughNftsLeftToMint();
error URIQueryForNonexistentToken();
error CannotSetToZeroAddress();
error TooManyNFTsInSingleTx();
error PublicMintNotActive();
error IncorrectAmtOfEthForTx();
error MintingFromContractNotAllowed();
error AllowlistMintNotActive();
error InvalidProof();
error RequestedMintAmountInvalid();
error IndAmountReservedExceedsTotalReserved();
error InvalidInternalAmount();
error StakingActiveForThisNft();
error OnlyOwnerCanTransferWhileStaking();
error StakingClosed();

contract NftStakingContract is ERC721A, Ownable, ReentrancyGuard {
  // declares the maximum amount of tokens that can be minted
  uint256 public constant MAX_TOTAL_TOKENS = 4;

  // max number of mints per transaction
  uint256 public constant ALLOW_LIST_MINT_MAX_PER_TX = 1;
  uint256 public constant PUB_MINT_MAX_PER_TX = 2;

  // price of mints depending on state of sale
  uint256 public itemPriceAl = 0.06 ether;
  uint256 public itemPricePublic = 0.08 ether;

  // merkle root for allowlist
  bytes32 public root;

  // metadata
  string private baseURI = "revealedURI.ipfs/"; // Needs trailing `/`, change to real URI for new project
  string private unrevealedURI = "ipfs://unrevealedURI"; // Change to real URI for new project

  // status
  bool public isAllowlistActive;
  bool public isPublicMintActive;
  bool public isRevealed;

  // reserved mints for the team
  mapping (address => uint256) private reservedMints;
  uint256 public totalReserved = 1;

  // staking
  mapping(uint256 => uint256) private stakingStarted; // staking start time, if 0 token is currently unstaked
  mapping(uint256 => uint256) private stakingTotal; // cumulative staking total per token
  uint256 private stakingTransfer = 1; // control for transfers while staking, if set to 2 then transfers are enabled
  bool public stakingOpen = false;

  using Strings for uint256;

  constructor (bytes32 _root) ERC721A("Advanced NFT", "ANFT") {
    root = _root;

    // Update with actual reserve addresses, don't forget to update totalReserved
    reservedMints[_msgSender()] = 1;
  }

  function internalMint(uint256 _amt) external nonReentrant {
    uint256 amtReserved = reservedMints[msg.sender];

    if (totalSupply() + _amt > MAX_TOTAL_TOKENS) revert NotEnoughNftsLeftToMint();
    if (amtReserved > totalReserved) revert IndAmountReservedExceedsTotalReserved();
    if (amtReserved < _amt) revert InvalidInternalAmount();        

    reservedMints[msg.sender] -= _amt;
    totalReserved -= _amt;

    _safeMint(msg.sender, _amt);           
  }

  function allowlistMint(bytes32[] calldata _proof, uint256 _amt) external payable nonReentrant {
    if (totalSupply() + _amt > MAX_TOTAL_TOKENS - totalReserved) revert NotEnoughNftsLeftToMint(); 
    if (msg.sender != tx.origin) revert MintingFromContractNotAllowed();
    if (itemPriceAl * _amt != msg.value) revert IncorrectAmtOfEthForTx();
    if (!isAllowlistActive) revert AllowlistMintNotActive();

    uint64 newClaimTotal = _getAux(msg.sender) + uint64(_amt);
    if (newClaimTotal > ALLOW_LIST_MINT_MAX_PER_TX) revert RequestedMintAmountInvalid();

    bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
    if (!MerkleProof.verify(_proof, root, leaf)) revert InvalidProof();

    _setAux(msg.sender, newClaimTotal);
    _safeMint(msg.sender, _amt);   
  }

  function publicMint(uint256 _amt) external payable nonReentrant {
    if (totalSupply() + _amt > MAX_TOTAL_TOKENS - totalReserved) revert NotEnoughNftsLeftToMint();
    if (msg.sender != tx.origin) revert MintingFromContractNotAllowed();
    if (itemPricePublic * _amt != msg.value) revert IncorrectAmtOfEthForTx();
    if (!isPublicMintActive) revert PublicMintNotActive();
    if (_amt > PUB_MINT_MAX_PER_TX) revert TooManyNFTsInSingleTx();

    _safeMint(msg.sender, _amt);
  }

  //  OnlyOwner Set Functions

  function setAllowlistMintActive(bool _val) external onlyOwner {
    isAllowlistActive = _val;
  }

  function setPublicMintActive(bool _val) external onlyOwner {
    isPublicMintActive = _val;
  }

  function setIsRevealed(bool _val) external onlyOwner {
    isRevealed = _val;
  }

  function setNewRoot(bytes32 _root) external onlyOwner {
    root = _root;
  }

  function setItemPricePublic(uint256 _price) external onlyOwner {
    itemPricePublic = _price;
  }

  function setItemPriceAL(uint256 _price) external onlyOwner {
    itemPriceAl = _price;
  }

  function setBaseURI(string memory _uri) external onlyOwner {
    baseURI = _uri;
  }
  function setUnrevealedURI(string memory _uri) external onlyOwner {
    unrevealedURI = _uri;
  }

  function isOnAllowList(bytes32[] calldata _proof, address _user) public view returns (uint256) {
    bytes32 leaf = keccak256(abi.encodePacked(_user));
    return MerkleProof.verify(_proof, root, leaf) ? 1 : 0;
  }

  function getSaleStatus() public view returns (string memory) {
    if(isPublicMintActive) {
      return "public";
    }
    else if(isAllowlistActive) {
      return "allowlist";
    }
    else {
      return "closed";
    }
  }

  function tokenURI(uint256 _tokenID) public view virtual override returns (string memory) {
    if (!_exists(_tokenID)) revert URIQueryForNonexistentToken(); 

    if(isRevealed) {
      // if revealed
      return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, _tokenID.toString(), ".json")) : "";
    } else {
      // if not revealed
      return unrevealedURI;
    }
  }

  /*
  Usage of _beforeTokenTransfers hook from ERC721A to add revert statements for transfers that prevents staked tokens from being transfered
  */

  function _beforeTokenTransfers(
    address,
    address,
    uint256 startTokenId,
    uint256 quantity
  ) internal view override {
    uint256 tokenId = startTokenId;
    for (uint256 end = tokenId + quantity; tokenId < end; ++tokenId) {
      require(stakingStarted[tokenId] == 0 || stakingTransfer == 2, "Staking Active");
    }
  }

  // staking functions and events

  // emitted when a token is staked
  event Staked(uint256 indexed tokenId);


  // emitted when a token is unstaked
  event Unstaked(uint256 indexed tokenId);

  // returning staking period data
  function stakingPeriod(uint256 tokenId) external view returns (
    bool staking, // whether or not nft is staking
    uint256 current, // current stake period if so
    uint256 total // lifetime stake period
  ) {
    uint256 start = stakingStarted[tokenId];
    if (start != 0) {
      staking = true;
      current = block.timestamp - start;
    }
    total = current + stakingTotal[tokenId];
  }

  // transfer while staking
  function safeTransferWhileStaking(
    address from,
    address to, 
    uint256 tokenId
  ) external {
    if (ownerOf(tokenId) != _msgSender()) revert OnlyOwnerCanTransferWhileStaking();
    stakingTransfer = 2; 
    safeTransferFrom(from, to, tokenId);
    stakingTransfer = 1;
  }

  // open/close staking globally
  function setStakingOpen(bool open) external onlyOwner {
    stakingOpen = open;
  }

  // toggle staking 
  function toggleStaking(uint256 tokenId) internal onlyApprovedOrOwner(tokenId) {
    uint256 start = stakingStarted[tokenId];
    if(start == 0) {
      if (!stakingOpen) revert StakingClosed();
      stakingStarted[tokenId] = block.timestamp;
      emit Staked(tokenId);
    }else {
      stakingTotal[tokenId] += block.timestamp - start;
      stakingStarted[tokenId] = 0;
      emit Unstaked(tokenId);
    }
  }

  // toggle staking, callable from frontend w support for multiple tokens
  function toggleStaking(uint256[] calldata tokenIds) external {
    uint256 n = tokenIds.length;
    for (uint256 i = 0; i < n; i++) {
      toggleStaking(tokenIds[i]);
    }
  }

  function withdrawEth() public onlyOwner nonReentrant {
    uint256 total = address(this).balance;

    require(payable(0x452A89F1316798fDdC9D03f9af38b0586F8142e5).send((total * 5) / 100));
    require(payable(0x10b5B489E9b4d220Ab6e4a0E7276c54D5bf837cD).send((total * 15) / 100));
    require(payable(0x41e1c9116667Fcc9dd640287796fB5eBDB1DB70E).send((total * 20) / 100));
    require(payable(0x5C2ce2d9eFAA4361aB129f77Bdad019A9a1b1cbe).send((total * 20) / 100));
    require(payable(0x6D9d741BC5Bca227070C43a23977E2FDE6B971e9).send((total * 20) / 100));
    require(payable(0x94Eb23cC87c4826DF76158151e0C3e94c18f02bB).send((total * 20) / 100));
  }

  receive() external payable {
    revert ContractDoesNotAllowReceiptOfTokens();
  }

  fallback() external payable {
    revert AnIncorrectFunctionWasCalled();
  }

  modifier onlyApprovedOrOwner(uint256 tokenId) {
    require(
      _ownershipOf(tokenId).addr == _msgSender() ||
        getApproved(tokenId) == _msgSender(),
      "ERC721ACommon: Not approved nor owner"
    );
    _;
  }
}