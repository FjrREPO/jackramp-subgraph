// src/jackramp.ts
import {
  RequestOfframp as RequestOfframpEvent,
  FillOfframp as FillOfframpEvent,
  NewTaskCreated as NewTaskCreatedEvent,
  TaskResponded as TaskRespondedEvent,
  Transfer as TransferEvent,
  Mint as MintEvent,
  Withdraw as WithdrawEvent
} from "../generated/jackramp/jackramp"
import {
  Task,
  Operator,
  Token,
  TokenHolder,
  Transfer,
  Mint,
  Withdraw,
  OffRamp
} from "../generated/schema"
import { BigInt, Bytes, log } from "@graphprotocol/graph-ts"

const STATUS_PENDING = "PENDING";
const STATUS_COMPLETED = "COMPLETED";

export function handleRequestOfframp(event: RequestOfframpEvent): void {
  let entity = new OffRamp(event.params.requestOfframpId);

  entity.id = event.params.requestOfframpId;
  entity.user = event.params.params.user;
  entity.requestedAmount = event.params.params.amount;
  entity.requestedAmountRealWorld = event.params.params.amountRealWorld;
  entity.channelAccount = event.params.params.channelAccount;
  entity.channelId = event.params.params.channelId;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.status = STATUS_PENDING;

  entity.save();
}

export function handleFillOfframp(event: FillOfframpEvent): void {
  const entity = OffRamp.load(event.params.requestOfframpId);

  if (entity === null) {
    log.error("OffRamp entity not found for requestOfframpId: {}", [
      event.params.requestOfframpId.toHexString(),
    ]);

    return;
  }

  entity.receiver = event.params.receiver;
  entity.proof = event.params.proof;
  entity.reclaimProof = event.params.reclaimProof;
  entity.fillBlockNumber = event.block.number;
  entity.fillBlockTimestamp = event.block.timestamp;
  entity.fillTransactionHash = event.transaction.hash;
  entity.status = STATUS_COMPLETED;

  entity.save();
}

export function handleNewTaskCreated(event: NewTaskCreatedEvent): void {
  let id = event.params.taskIndex.toString()
  let task = new Task(id)
  
  task.taskIndex = event.params.taskIndex
  task.channelId = event.params.task.channelId
  task.transactionId = event.params.task.transactionId
  task.requestOfframpId = event.params.task.requestOfframpId
  task.receiver = event.params.task.receiver
  task.taskCreatedBlock = event.params.task.taskCreatedBlock
  task.offrampRequest = event.params.task.requestOfframpId.toHexString()
  task.status = "PENDING"
  task.createdAt = event.block.timestamp
  task.transactionHash = event.transaction.hash

  task.save()
}

export function handleTaskResponded(event: TaskRespondedEvent): void {
  let id = event.params.taskIndex.toString()
  let task = Task.load(id)
  
  if (task) {
    task.status = "COMPLETED"
    task.respondedAt = event.block.timestamp
    
    let operatorId = event.params.operator.toHexString()
    let operator = Operator.load(operatorId)
    
    if (!operator) {
      operator = new Operator(operatorId)
      operator.address = event.params.operator
      operator.totalTasksCompleted = BigInt.fromI32(0)
    }
    
    operator.totalTasksCompleted = operator.totalTasksCompleted.plus(BigInt.fromI32(1))
    operator.lastActiveTimestamp = event.block.timestamp
    
    task.operator = operatorId
    
    operator.save()
    task.save()
  }
}

export function handleTransfer(event: TransferEvent): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString()
  let transfer = new Transfer(id)
  let tokenId = event.address.toHexString()
  
  // Load or create token
  let token = Token.load(tokenId)
  if (!token) {
    token = new Token(tokenId)
    token.totalSupply = BigInt.fromI32(0)
    token.save()
  }
  
  // Handle receiver
  let toHolderId = event.params.to.toHexString()
  let toHolder = TokenHolder.load(toHolderId)
  if (!toHolder) {
    toHolder = new TokenHolder(toHolderId)
    toHolder.token = tokenId
    toHolder.address = event.params.to
    toHolder.balance = BigInt.fromI32(0)
  }
  
  toHolder.balance = toHolder.balance.plus(event.params.value)
  
  // Handle sender
  if (event.params.from.toHexString() != "0x0000000000000000000000000000000000000000") {
    let fromHolder = TokenHolder.load(event.params.from.toHexString())
    if (fromHolder) {
      fromHolder.balance = fromHolder.balance.minus(event.params.value)
      fromHolder.save()
    }
  }
  
  transfer.from = event.params.from
  transfer.to = toHolderId
  transfer.value = event.params.value
  transfer.timestamp = event.block.timestamp
  transfer.transactionHash = event.transaction.hash
  
  transfer.save()
  toHolder.save()
}

export function handleMint(event: MintEvent): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString()
  let mint = new Mint(id)
  
  mint.user = event.params.user
  mint.amount = event.params.amount
  mint.timestamp = event.block.timestamp
  mint.transactionHash = event.transaction.hash
  
  // Update token supply
  let token = Token.load(event.address.toHexString())
  if (!token) {
    token = new Token(event.address.toHexString())
    token.totalSupply = BigInt.fromI32(0)
  }
  token.totalSupply = token.totalSupply.plus(event.params.amount)
  
  mint.save()
  token.save()
}

export function handleWithdraw(event: WithdrawEvent): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString()
  let withdraw = new Withdraw(id)
  
  withdraw.user = event.params.user
  withdraw.amount = event.params.amount
  withdraw.timestamp = event.block.timestamp
  withdraw.transactionHash = event.transaction.hash
  
  // Update token supply
  let token = Token.load(event.address.toHexString())
  if (token) {
    token.totalSupply = token.totalSupply.minus(event.params.amount)
    token.save()
  }
  
  withdraw.save()
}