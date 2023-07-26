import express from "express";
import {
    Connection,
    PublicKey,
    ParsedTransactionWithMeta,
    PartiallyDecodedInstruction,
    ParsedInstruction
} from "@solana/web3.js";

const app = express()
const port = 3000

app.listen(port, async () => {
    function isPartiallyDecodedInstruction(instruction: ParsedInstruction | PartiallyDecodedInstruction): 
        instruction is PartiallyDecodedInstruction {
        return (instruction as PartiallyDecodedInstruction).data !== undefined;
    }
    
    console.log(`Example app listening at http://localhost:${port}`)

    let token2022address = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

    let txCount = 0;
    let trackedInstructionMap = new Map();
    const ignoreList = ["initializeMint", "initializeAccount", "initializeMultisig", "transfer", "approve",
        "revoke", "setAuthority", "mintTo", "burn", "closeAccount", "freezeAccount", "thawAccount", "transferChecked",
        "approveChecked", "mintToChecked", "burnChecked", "syncNative", "initializeAccount3", "initializeMint2",
        "getAccountDataSize", "initializeImmutableOwner", "initializeMintCloseAuthority", "initializeTransferFeeConfig",
        "transferCheckedWithFee", "withdrawWithheldTokensFromMint", "withdrawWithheldTokensFromAccounts",
        "harvestWithheldTokensToMint", "setTransferFee", "initializeDefaultAccountState", "updateDefaultAccountState",
        "reallocate",
        "enableRequiredMemoTransfers", "disableRequiredMemoTransfers", "initializeNonTransferableMint",
        "initializeInterestBearingConfig",
        "updateInterestBearingConfigRate", "initializePermanentDelegate", "enableCpiGuard", "disableCPIGuard"];

    // const connection = new Connection(
    //     "https://autumn-alien-mountain.solana-devnet.quiknode.pro/40faaf7741f36015ab9e98843de98332840d34dd/", "confirmed");
    const connection = new Connection(
        "https://solana-rpc.xnfts.dev/", "confirmed");
    const token2022 = new PublicKey(token2022address);

    let lastOldestTx = "B84mKzqiwtwn7oeTFaGfV2YB4MCXYgAqYmmxouGRpigGMQr6qfh5N65ZfbhyiYrX4wGaH9NZ44sxuz9PnZ5J2fg";

    console.log("Blacklisting " + ignoreList.length + " instructions: " + ignoreList);

    while (true) {
        let sigObjs = await connection.getSignaturesForAddress(token2022,
            {before: lastOldestTx, limit: 500});
        let settledTxs: Array<PromiseSettledResult<ParsedTransactionWithMeta>> = await Promise.allSettled(sigObjs.map(async sigObj => {
            let parsedTransactionWithMeta = await connection.getParsedTransaction(
                sigObj.signature, {
                    maxSupportedTransactionVersion: 2
                });

            // Handle ERR_STREAM_PREMATURE_CLOSE
            while (parsedTransactionWithMeta === null) {
                // Retry again
                parsedTransactionWithMeta = await connection.getParsedTransaction(sigObj.signature, {
                    maxSupportedTransactionVersion: 2
                });
            }

            return parsedTransactionWithMeta;
        }));

        let txs: Array<ParsedTransactionWithMeta> = settledTxs
            .filter((result): result is
                PromiseFulfilledResult<ParsedTransactionWithMeta> => result.status === 'fulfilled')
            .map(result => result.value);

        for (let tx of txs) {
            // process.stdout.write("Processing tx " + txCount++ + "\r");

            // Avoid Uncaught TypeError: Cannot read properties of undefined (reading 'transaction')
            if (tx !== undefined && tx.transaction !== undefined && tx.transaction.message !== undefined
                && tx.transaction.message.instructions !== undefined) {
                let txSignature = tx.transaction.signatures[0].toString();
                let instructions = tx.transaction.message.instructions
                    .filter((ix) => !isPartiallyDecodedInstruction(ix)) as ParsedInstruction[];

                for (const instruction of instructions) {
                    if (instruction.programId.toString() === token2022address && instruction.parsed
                        && instruction.parsed.type) {
                        if (!trackedInstructionMap.has(instruction.parsed.type)
                            && ignoreList.indexOf(instruction.parsed.type) === -1)
                            trackedInstructionMap.set(instruction.parsed.type, [txSignature]);
                        else if (trackedInstructionMap.has(instruction.parsed.type)
                            && trackedInstructionMap.get(instruction.parsed.type).indexOf(txSignature) === -1
                            && ignoreList.indexOf(instruction.parsed.type) === -1)
                            trackedInstructionMap.get(instruction.parsed.type).push(txSignature);
                    }
                }

                if (tx.meta?.innerInstructions)
                    for (let innerInstruction of tx.meta.innerInstructions) {
                        let innerIxs = innerInstruction.instructions
                            .filter((ix) => 
                                !isPartiallyDecodedInstruction(ix)) as ParsedInstruction[];
                        for (const innerIx of innerIxs) {
                            if (innerIx.programId.toString() === token2022address && innerIx.parsed
                                && innerIx.parsed.type) {
                                if (innerIx.parsed) {
                                    if (!trackedInstructionMap.has(innerIx.parsed.type)
                                        && ignoreList.indexOf(innerIx.parsed.type) === -1)
                                        trackedInstructionMap.set(innerIx.parsed.type, [txSignature]);
                                    else if (trackedInstructionMap.has(innerIx.parsed.type)
                                        && trackedInstructionMap.get(innerIx.parsed.type).indexOf(txSignature) === -1
                                        && ignoreList.indexOf(innerIx.parsed.type) === -1)
                                        trackedInstructionMap.get(innerIx.parsed.type).push(txSignature);
                                }
                            }
                        }
                    }
            } else {
                console.log("tx is undefined");
            }
        }

        txCount += txs.length;

        console.log("===================================================");
        console.log("Total txs processed: " + txCount + " | Transactions: " +
            txs.flatMap((tx) => tx.transaction.signatures[0]));
        console.log(trackedInstructionMap);
        console.log("===================================================");

        if (txs.length > 0)
            if (txs[txs.length - 1].transaction.signatures[0] === lastOldestTx) {
                console.log("No more transactions to process")
                break;
            } else {
                lastOldestTx = txs[txs.length - 1].transaction.signatures[0];
            }
        else
            console.error("FATAL: No transactions to process");
    }
})