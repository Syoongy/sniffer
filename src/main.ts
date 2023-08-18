import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  ParsedInstruction,
  VersionedTransactionResponse,
  ConfirmedSignatureInfo,
} from "@solana/web3.js";
import { EncodedTransactionWithMeta } from "./types/blockchain-syncer.js";
import processEncodedTransactions from "./processors/transaction.js";

function isPartiallyDecodedInstruction(
  instruction: ParsedInstruction | PartiallyDecodedInstruction,
): instruction is PartiallyDecodedInstruction {
  return (instruction as PartiallyDecodedInstruction).data !== undefined;
}

async function start() {
  let address = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";

  let txCount = 0;
  let trackedInstructionMap = new Map();
  const ignoreList: string[] = [
    "swap",
    "openPositionWithMetadata",
    "increaseLiquidity",
    "updateFeesAndRewards",
    "collectFees",
  ];

  // const connection = new Connection(
  //     "https://autumn-alien-mountain.solana-devnet.quiknode.pro/40faaf7741f36015ab9e98843de98332840d34dd/", "confirmed");
  const connection = new Connection("https://solana-rpc.xnfts.dev/", "confirmed");
  const addressPubkey = new PublicKey(address);

  let lastOldestTx = "5XjcKyouisQa6tU5D4maVjQRLQH6W33vQ65qP2WtK4Qqxce1sqfQA3cV4ZDSHJxGUTogWoMujSBgp4VwdKDrNKEw";

  console.log("Blacklisting " + ignoreList.length + " instructions: " + ignoreList);

  while (true) {
    let sigObjs = await connection.getSignaturesForAddress(addressPubkey, { before: lastOldestTx, limit: 500 });
    let settledTxs: Array<PromiseSettledResult<EncodedTransactionWithMeta>> = await Promise.allSettled(
      sigObjs.map(async (sigObj) => {
        let parsedTransactionWithMeta = await connection.getTransaction(sigObj.signature, {
          maxSupportedTransactionVersion: 2,
        });

        // Handle ERR_STREAM_PREMATURE_CLOSE
        while (parsedTransactionWithMeta === null) {
          // Retry again
          parsedTransactionWithMeta = await connection.getTransaction(sigObj.signature, {
            maxSupportedTransactionVersion: 2,
          });
        }
        const retParsedTransaction: EncodedTransactionWithMeta = {
          transaction: {
            message: parsedTransactionWithMeta.transaction.message,
            signatures: parsedTransactionWithMeta.transaction.signatures,
          },
          meta: parsedTransactionWithMeta.meta,
          version: parsedTransactionWithMeta.version,
        };
        return retParsedTransaction;
      }),
    );

    let txs: EncodedTransactionWithMeta[] = settledTxs
      .filter((result): result is PromiseFulfilledResult<EncodedTransactionWithMeta> => result.status === "fulfilled")
      .map((result) => result.value);

    let decodedTransactionsMap = await processEncodedTransactions(0, txs, []);

    for (let tx of decodedTransactionsMap) {
      let txSignature = tx[0];
      let instructions = tx[1];

      for (const instruction of instructions) {
        if (!trackedInstructionMap.has(instruction.name) && ignoreList.indexOf(instruction.name) === -1)
          trackedInstructionMap.set(instruction.name, [txSignature]);
        else if (
          trackedInstructionMap.has(instruction.name) &&
          trackedInstructionMap.get(instruction.name).indexOf(txSignature) === -1 &&
          ignoreList.indexOf(instruction.name) === -1
        )
          trackedInstructionMap.get(instruction.name).push(txSignature);
      }
    }

    txCount += txs.length;

    console.log("===================================================");
    console.log("Total txs processed: " + txCount);
    console.log(trackedInstructionMap);
    console.log(`Last TX = ${lastOldestTx}`);
    console.log("===================================================");
    if (txs.length > 0)
      if (txs[txs.length - 1].transaction.signatures[0] === lastOldestTx) {
        console.log("No more transactions to process");
        console.log(`Last TX = ${lastOldestTx}`);
        break;
      } else {
        lastOldestTx = txs[txs.length - 1].transaction.signatures[0];
      }
    else console.error("FATAL: No transactions to process");
  }
}

async function getTrackedInstructionMap(
  connection: Connection,
  sigObjs: ConfirmedSignatureInfo[],
  address: string,
  ignoreList: string[],
) {
  let settledTxs: Array<PromiseSettledResult<ParsedTransactionWithMeta>> = await Promise.allSettled(
    sigObjs.map(async (sigObj) => {
      let parsedTransactionWithMeta = await connection.getParsedTransaction(sigObj.signature, {
        maxSupportedTransactionVersion: 2,
      });

      // Handle ERR_STREAM_PREMATURE_CLOSE
      while (parsedTransactionWithMeta === null) {
        // Retry again
        parsedTransactionWithMeta = await connection.getParsedTransaction(sigObj.signature, {
          maxSupportedTransactionVersion: 2,
        });
      }

      return parsedTransactionWithMeta;
    }),
  );

  let txs: Array<ParsedTransactionWithMeta> = settledTxs
    .filter((result): result is PromiseFulfilledResult<ParsedTransactionWithMeta> => result.status === "fulfilled")
    .map((result) => result.value);

  let trackedInstructionMap = new Map();
  for (let tx of txs) {
    // process.stdout.write("Processing tx " + txCount++ + "\r");

    // Avoid Uncaught TypeError: Cannot read properties of undefined (reading 'transaction')
    if (
      tx !== undefined &&
      tx.transaction !== undefined &&
      tx.transaction.message !== undefined &&
      tx.transaction.message.instructions !== undefined
    ) {
      let txSignature = tx.transaction.signatures[0].toString();
      let instructions = tx.transaction.message.instructions.filter(
        (ix) => !isPartiallyDecodedInstruction(ix),
      ) as ParsedInstruction[];

      for (const instruction of instructions) {
        if (instruction.programId.toString() === address && instruction.parsed && instruction.parsed.type) {
          console.log(instruction.parsed);
          if (!trackedInstructionMap.has(instruction.parsed.type) && ignoreList.indexOf(instruction.parsed.type) === -1)
            trackedInstructionMap.set(instruction.parsed.type, [txSignature]);
          else if (
            trackedInstructionMap.has(instruction.parsed.type) &&
            trackedInstructionMap.get(instruction.parsed.type).indexOf(txSignature) === -1 &&
            ignoreList.indexOf(instruction.parsed.type) === -1
          )
            trackedInstructionMap.get(instruction.parsed.type).push(txSignature);
        }
      }

      if (tx.meta?.innerInstructions)
        for (let innerInstruction of tx.meta.innerInstructions) {
          let innerIxs = innerInstruction.instructions.filter(
            (ix) => !isPartiallyDecodedInstruction(ix),
          ) as ParsedInstruction[];
          for (const innerIx of innerIxs) {
            if (innerIx.programId.toString() === address && innerIx.parsed && innerIx.parsed.type) {
              if (innerIx.parsed) {
                if (!trackedInstructionMap.has(innerIx.parsed.type) && ignoreList.indexOf(innerIx.parsed.type) === -1)
                  trackedInstructionMap.set(innerIx.parsed.type, [txSignature]);
                else if (
                  trackedInstructionMap.has(innerIx.parsed.type) &&
                  trackedInstructionMap.get(innerIx.parsed.type).indexOf(txSignature) === -1 &&
                  ignoreList.indexOf(innerIx.parsed.type) === -1
                )
                  trackedInstructionMap.get(innerIx.parsed.type).push(txSignature);
              }
            }
          }
        }
    } else {
      console.log("tx is undefined");
    }
  }
}

start();
