import { Connection, PublicKey, } from "@solana/web3.js";
function isPartiallyDecodedInstruction(instruction) {
    return instruction.data !== undefined;
}
async function start() {
    let address = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    let txCount = 0;
    let trackedInstructionMap = new Map();
    const ignoreList = [];
    // const connection = new Connection(
    //     "https://autumn-alien-mountain.solana-devnet.quiknode.pro/40faaf7741f36015ab9e98843de98332840d34dd/", "confirmed");
    const connection = new Connection("https://solana-rpc.xnfts.dev/", "confirmed");
    const addressPubkey = new PublicKey(address);
    let lastOldestTx = "6X8mbnWYTrUvyGyqZmoDe74Cd1GDxKqaT4WZJWpNcSt4LMSfJaqxjoM59pqpcRd8dwX337SXuwuXrza7E96a54N";
    console.log("Blacklisting " + ignoreList.length + " instructions: " + ignoreList);
    while (true) {
        let sigObjs = await connection.getSignaturesForAddress(addressPubkey, { before: lastOldestTx, limit: 5 });
        let settledTxs = await Promise.allSettled(sigObjs.map(async (sigObj) => {
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
        }));
        let txs = settledTxs
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value);
        for (let tx of txs) {
            // process.stdout.write("Processing tx " + txCount++ + "\r");
            // Avoid Uncaught TypeError: Cannot read properties of undefined (reading 'transaction')
            if (tx !== undefined &&
                tx.transaction !== undefined &&
                tx.transaction.message !== undefined &&
                tx.transaction.message.instructions !== undefined) {
                let txSignature = tx.transaction.signatures[0].toString();
                let instructions = tx.transaction.message.instructions.filter((ix) => !isPartiallyDecodedInstruction(ix));
                for (const instruction of instructions) {
                    if (instruction.programId.toString() === address && instruction.parsed && instruction.parsed.type) {
                        console.log(instruction.parsed);
                        if (!trackedInstructionMap.has(instruction.parsed.type) &&
                            ignoreList.indexOf(instruction.parsed.type) === -1)
                            trackedInstructionMap.set(instruction.parsed.type, [txSignature]);
                        else if (trackedInstructionMap.has(instruction.parsed.type) &&
                            trackedInstructionMap.get(instruction.parsed.type).indexOf(txSignature) === -1 &&
                            ignoreList.indexOf(instruction.parsed.type) === -1)
                            trackedInstructionMap.get(instruction.parsed.type).push(txSignature);
                    }
                }
                if (tx.meta?.innerInstructions)
                    for (let innerInstruction of tx.meta.innerInstructions) {
                        let innerIxs = innerInstruction.instructions.filter((ix) => !isPartiallyDecodedInstruction(ix));
                        for (const innerIx of innerIxs) {
                            if (innerIx.programId.toString() === address && innerIx.parsed && innerIx.parsed.type) {
                                if (innerIx.parsed) {
                                    if (!trackedInstructionMap.has(innerIx.parsed.type) && ignoreList.indexOf(innerIx.parsed.type) === -1)
                                        trackedInstructionMap.set(innerIx.parsed.type, [txSignature]);
                                    else if (trackedInstructionMap.has(innerIx.parsed.type) &&
                                        trackedInstructionMap.get(innerIx.parsed.type).indexOf(txSignature) === -1 &&
                                        ignoreList.indexOf(innerIx.parsed.type) === -1)
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
        txCount += txs.length;
        console.log("===================================================");
        console.log("Total txs processed: " + txCount);
        console.log(trackedInstructionMap);
        console.log("===================================================");
        if (txs.length > 0)
            if (txs[txs.length - 1].transaction.signatures[0] === lastOldestTx) {
                console.log("No more transactions to process");
                console.log(`Last TX = ${lastOldestTx}`);
                break;
            }
            else {
                lastOldestTx = txs[txs.length - 1].transaction.signatures[0];
            }
        else
            console.error("FATAL: No transactions to process");
    }
}
start();
