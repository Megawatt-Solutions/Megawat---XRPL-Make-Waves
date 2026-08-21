// Minimal human-readable ABIs for the Stream Vault demo (ethers v6 format).
// Only what the frontend actually calls — the full ABIs live in contracts/out.

export const STREAM_VAULT_ABI = [
  // config
  "function secondsPerMonth() view returns (uint256)",
  "function sweepShareBps() view returns (uint16)",
  "function drawdownTimelock() view returns (uint64)",
  "function epochCapBps() view returns (uint16)",
  "function redeemSpreadBps() view returns (uint16)",
  "function subscriptionThresholdBps() view returns (uint16)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  // tranches
  "function trancheCount() view returns (uint256)",
  "function getTranche(uint256 trancheId) view returns (tuple(string name, uint8 state, uint256 capexTarget, uint256 refMWhTotal, uint256 expRevPerMWh, uint64 longstop, uint32 termMonths, uint64 streamStart, address spvAccount, uint256 escrowShares, uint256 escrowPrincipal, uint256 budgetRemaining, uint256 unitsMinted, uint64 monthsSwept, uint256 perfFactorBps))",
  "function receipts(uint256 trancheId, address depositor) view returns (uint256)",
  "function totalSupply(uint256 id) view returns (uint256)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function totalUnitsLive() view returns (uint256)",
  "function reserveShares() view returns (uint256)",
  // lifecycle
  "function deposit(uint256 trancheId, uint256 amount)",
  "function refund(uint256 trancheId)",
  "function claimRefund(uint256 trancheId) returns (uint256)",
  "function convertAtNTP(uint256 trancheId)",
  "function expireVintage(uint256 trancheId)",
  // drawdowns
  "function postMilestoneCert(uint256 trancheId, bytes32 certHash, string memo)",
  "function queueDrawdown(uint256 trancheId, uint256 amount, bytes32 certHash) returns (uint256)",
  "function confirmDrawdown(uint256 drawdownId, bytes32 role)",
  "function executeDrawdown(uint256 drawdownId)",
  "function drawdownCount() view returns (uint256)",
  "function drawdowns(uint256 id) view returns (uint256 trancheId, uint256 amount, bytes32 certHash, uint64 eta, bool executed, uint8 confirmations)",
  "function drawdownConfirmedByRole(uint256 id, bytes32 role) view returns (bool)",
  "function latestCert(uint256 trancheId) view returns (bytes32)",
  "function certUsed(bytes32 certHash) view returns (bool)",
  // sweeps
  "function sweep(uint256 trancheId, uint256 grossRevenue, uint256 ownerRemainder, bytes32 meterRef, bytes32 tsoRef, bytes32 bankRef)",
  // redemption
  "function requestRedeem(uint256 trancheId, uint256 units) returns (uint256)",
  "function closeEpoch()",
  "function redeemQueueLength() view returns (uint256)",
  "function redeemQueue(uint256 i) view returns (address owner, uint256 trancheId, uint256 units)",
  "function queueHead() view returns (uint256)",
  "function lastEpochClose() view returns (uint64)",
  "function epochCount() view returns (uint256)",
  // events
  "event TrancheCreated(uint256 indexed trancheId, string name, uint256 capexTarget, uint64 longstop, address spvAccount)",
  "event PreDeposited(uint256 indexed trancheId, address indexed depositor, uint256 amount)",
  "event ConvertedAtNTP(uint256 indexed trancheId, uint256 unitsMinted, uint256 pvNew, uint256 poolNavBefore)",
  "event MilestoneCertified(uint256 indexed trancheId, bytes32 certHash, string memo)",
  "event DrawdownQueued(uint256 indexed drawdownId, uint256 indexed trancheId, uint256 amount, bytes32 certHash, uint64 eta)",
  "event DrawdownExecuted(uint256 indexed drawdownId, uint256 indexed trancheId, uint256 amount, address spvAccount)",
  "event SweepReceived(uint256 indexed trancheId, uint64 month, uint256 grossRevenue, uint256 sweptAmount, uint256 ownerRemainder, bytes32 meterRef, bytes32 tsoRef, bytes32 bankRef)",
  "event RedeemQueued(uint256 indexed requestId, uint256 indexed trancheId, address indexed owner, uint256 units)",
  "event RedeemPaid(uint256 indexed requestId, uint256 indexed trancheId, address indexed owner, uint256 units, uint256 assets, uint256 redeemNav)",
  "event EpochClosed(uint256 indexed epoch, uint256 paidRequests, uint256 paidAssets, uint256 reservesAfter)",
] as const;

export const NAV_ORACLE_ABI = [
  "function discountRateBps() view returns (uint16)",
  "function pvOfTranche(uint256 trancheId) view returns (uint256)",
  "function reservesValue() view returns (uint256)",
  "function poolNav() view returns (uint256)",
  "function navPerUnit(uint256 trancheId) view returns (uint256)",
  "function navHistoryLength() view returns (uint256)",
  "function getNavHistory() view returns (tuple(uint64 timestamp, uint256 poolNav, uint256 totalUnits)[])",
] as const;

export const MOCK_USD_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function faucet()",
  "function lastFaucet(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
] as const;

export const MOCK_TBILL_ABI = [
  "function aprBps() view returns (uint16)",
  "function index() view returns (uint256)",
  "function previewRedeem(uint256 shares) view returns (uint256)",
] as const;
