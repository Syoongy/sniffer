"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const web3_js_1 = require("@solana/web3.js");
const app = (0, express_1.default)();
const port = 3000;
app.listen(port, async () => {
    function isPartiallyDecodedInstruction(instruction) {
        return instruction.data !== undefined;
    }
    console.log(`Example app listening at http://localhost:${port}`);
    let token2022address = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    let txCount = 0;
    let trackedInstructionMap = new Map();
    const ignoreList = ["initializeMint", "initializeAccount", "initializeMultisig", "revoke", "setAuthority",
        "mintTo", "burn", "closeAccount", "freezeAccount", "thawAccount", "transferChecked", "approveChecked",
        "mintToChecked", "burnChecked", "initializeAccount3", "initializeMint2", "getAccountDataSize",
        "initializeImmutableOwner", "initializeMintCloseAuthority", "initializeTransferFeeConfig",
        "transferCheckedWithFee", "withdrawWithheldTokensFromMint", "withdrawWithheldTokensFromAccounts",
        "harvestWithheldTokensToMint", "initializeDefaultAccountState", "updateDefaultAccountState", "reallocate",
        "enableRequiredMemoTransfers", "disableRequiredMemoTransfers", "initializeNonTransferableMint", "initializeInterestBearingConfig",
        "updateInterestBearingConfigRate", "initializePermanentDelegate", "enableCpiGuard", "disableCPIGuard"];
    const connection = new web3_js_1.Connection("https://autumn-alien-mountain.solana-devnet.quiknode.pro/40faaf7741f36015ab9e98843de98332840d34dd/", "confirmed");
    const token2022 = new web3_js_1.PublicKey(token2022address);
    let lastOldestTx = "48URw1W7xhDbrcYSVJgs7K8V1bm6xPKNvWQNMnmCV53yRukY1ydya8tLo21NdrCoMkYCkMxNrnmU6AhJ4LFqJKkS";
    console.log("Blacklisting " + ignoreList.length + " instructions: " + ignoreList);
    while (true) {
        let sigObjs = await connection.getSignaturesForAddress(token2022, { before: lastOldestTx, limit: 200 });
        let settledTxs = await Promise.allSettled(sigObjs.map(async (sigObj) => {
            let parsedTransactionWithMeta = await connection.getParsedTransaction(sigObj.signature, {
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
        let txs = settledTxs
            .filter((result) => result.status === 'fulfilled')
            .map(result => result.value);
        for (let tx of txs) {
            // process.stdout.write("Processing tx " + txCount++ + "\r");
            // Avoid Uncaught TypeError: Cannot read properties of undefined (reading 'transaction')
            if (tx !== undefined && tx.transaction !== undefined && tx.transaction.message !== undefined
                && tx.transaction.message.instructions !== undefined) {
                let txSignature = tx.transaction.signatures[0].toString();
                let instructions = tx.transaction.message.instructions
                    .filter((ix) => !isPartiallyDecodedInstruction(ix));
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
                            .filter((ix) => !isPartiallyDecodedInstruction(ix));
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
            }
            else {
                console.log("tx is undefined");
            }
        }
        console.log(trackedInstructionMap);
        if (txs.pop().transaction.signatures[0] === lastOldestTx) {
            console.log("No more transactions to process");
            break;
        }
        else {
            lastOldestTx = txs.pop().transaction.signatures[0];
        }
    }
});
