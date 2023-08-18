import { Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as assert from "assert";
import { Layout } from "buffer-layout";
import * as base64 from "base64-js";
import { sha256 } from "js-sha256";
import { BN } from "bn.js";
import { IdlTypeDefTyStruct } from "./idl.js";
import { IdlEvent, IdlEventField } from "../types/event.js";
import { Coder } from "./coder/anchor/event.js";
import { DecodeType } from "./coder/anchor/types.js";
import IdlCoder from "./coder/borsh/idl.js";
import logger from "../loader/log.js";
import { convertArrayObjectValuesToNumber, convertObjectValuesToNumber } from "../utils/recursiveStringifier.js";

const PROGRAM_LOG = "Program log: ";
const PROGRAM_DATA = "Program data: ";
const PROGRAM_LOG_START_INDEX = PROGRAM_LOG.length;
const PROGRAM_DATA_START_INDEX = PROGRAM_DATA.length;

// Deserialized event.
export type Event<E extends IdlEvent = IdlEvent, Defined = Record<string, never>> = {
  name: E["name"];
  data: EventData<E["fields"][number], Defined>;
};

export type EventData<T extends IdlEventField, Defined> = {
  [N in T["name"]]: DecodeType<(T & { name: N })["type"], Defined>;
};

export class EventParser {
  private coder: Coder;

  private programId: PublicKey;

  constructor(programId: PublicKey, coder: Coder) {
    this.coder = coder;
    this.programId = programId;
  }

  // Each log given, represents an array of messages emitted by
  // a single transaction, which can execute many different programs across
  // CPI boundaries. However, the subscription is only interested in the
  // events emitted by *this* program. In achieving this, we keep track of the
  // program execution context by parsing each log and looking for a CPI
  // `invoke` call. If one exists, we know a new program is executing. So we
  // push the programId onto a stack and switch the program context. This
  // allows us to track, for a given log, which program was executing during
  // its emission, thereby allowing us to know if a given log event was
  // emitted by *this* program. If it was, then we parse the raw string and
  // emit the event if the string matches the event being subscribed to.
  public parseLogs(logs: string[], idl: Idl, errorOnDecodeFailure: boolean = false) {
    const logScanner = new LogScanner(logs);
    const execution = new ExecutionContext();
    let log = logScanner.next();
    const ret = [];
    while (log !== null) {
      const [event, newProgram, didPop] = this.handleLog(execution, log, errorOnDecodeFailure, idl);
      if (event) {
        ret.push(event);
      }
      if (newProgram) {
        execution.push(newProgram);
      }
      if (didPop) {
        execution.pop();
      }
      log = logScanner.next();
    }
    return ret;
  }

  // Main log handler. Returns a three element array of the event, the
  // next program that was invoked for CPI, and a boolean indicating if
  // a program has completed execution (and thus should be popped off the
  // execution stack).
  private handleLog(
    execution: ExecutionContext,
    log: string,
    errorOnDecodeFailure: boolean,
    idl: Idl,
  ): [any | null, string | null, boolean] {
    // Executing program is this program.
    if (execution.stack.length > 0 && execution.program() === this.programId.toString()) {
      return this.handleProgramLog(log, errorOnDecodeFailure, idl);
    }
    // Executing program is not this program.

    return [null, ...this.handleSystemLog(log)];
  }

  // Handles logs from *this* program.
  private handleProgramLog(log: string, errorOnDecodeFailure: boolean, idl: Idl): [any | null, string | null, boolean] {
    // This is a `msg!` log or a `sol_log_data` log.
    if (log.startsWith(PROGRAM_LOG) || log.startsWith(PROGRAM_DATA)) {
      const logStr = log.startsWith(PROGRAM_LOG)
        ? log.slice(PROGRAM_LOG_START_INDEX)
        : log.slice(PROGRAM_DATA_START_INDEX);
      // const event = this.coder.events.decode(logStr);
      const event = decodeEventLog(idl, logStr);
      if (errorOnDecodeFailure && event === null) {
        throw new Error(`Unable to decode event ${logStr}`);
      }
      return [event, null, false];
    }
    // System log.

    return [null, ...this.handleSystemLog(log)];
  }

  // Handles logs when the current program being executing is *not* this.
  private handleSystemLog(log: string): [string | null, boolean] {
    // System component.
    const logStart = log.split(":")[0];

    // Did the program finish executing?
    if (logStart.match(/^Program (.*) success/g) !== null) {
      return [null, true];
      // Recursive call.
    }
    if (logStart.startsWith(`Program ${this.programId.toString()} invoke`)) {
      return [this.programId.toString(), false];
    }
    // CPI call.
    if (logStart.includes("invoke")) {
      return ["cpi", false]; // Any string will do.
    }
    return [null, false];
  }
}

// Stack frame execution context, allowing one to track what program is
// executing for a given log.
class ExecutionContext {
  stack: string[] = [];

  program(): string {
    assert.ok(this.stack.length > 0);
    return this.stack[this.stack.length - 1];
  }

  push(newProgram: string) {
    this.stack.push(newProgram);
  }

  pop() {
    assert.ok(this.stack.length > 0);
    this.stack.pop();
  }
}

class LogScanner {
  // eslint-disable-next-line no-useless-constructor, no-empty-function
  constructor(public logs: string[]) {}

  next(): string | null {
    if (this.logs.length === 0) {
      return null;
    }
    const l = this.logs[0];
    this.logs = this.logs.slice(1);
    return l;
  }
}

const parseEventLayout = (idl: Idl): Map<string, Layout> => {
  if (idl.events === undefined) {
    return new Map();
  }
  const layouts = idl.events.map((event): [string, Layout] => {
    const eventTypeDef = {
      name: event.name,
      type: {
        kind: "struct",
        fields: event.fields.map((f) => ({ name: f.name, type: f.type })),
      } as IdlTypeDefTyStruct,
    };
    return [event.name, IdlCoder.typeDefLayout(eventTypeDef, idl.types)];
  });
  return new Map(layouts);
};

// const populateEventLayout = (idl: Idl): Map<string, { layout: Layout; name: string }> => {
//   // Instruction args layout. Maps namespaced method
//   return parseEventLayout(idl);

//   return sighashLayouts;
// };

const decodeEventLog = (idl: Idl, log: string) => {
  const eventLayout = parseEventLayout(idl);
  let logArr;
  // This will throw if log length is not a multiple of 4.
  try {
    logArr = Buffer.from(base64.toByteArray(log));
  } catch (e) {
    return null;
  }
  const disc = base64.fromByteArray(logArr.subarray(0, 8));
  // Only deserialize if the discriminator implies a proper event.
  const discriminators = new Map(
    idl.events === undefined ? [] : idl.events.map((e) => [base64.fromByteArray(eventDiscriminator(e.name)), e.name]),
  );
  const eventName = discriminators.get(disc);
  if (eventName === undefined) {
    return null;
  }
  const layout = eventLayout.get(eventName);
  if (!layout) {
    throw new Error(`Unknown event: ${eventName}`);
  }
  const data = layout.decode(logArr.subarray(8));
  for (const [key, value] of Object.entries(data)) {
    try {
      if (BN.isBN(value)) {
        try {
          data[key] = value.toString(10);
        } catch (error) {
          continue;
        }
      } else if (Array.isArray(value)) {
        convertArrayObjectValuesToNumber(value, 0);
      } else if (value instanceof PublicKey) {
        data[key] = value.toString();
      } else if (value && typeof value === "object") {
        data[key] = convertObjectValuesToNumber(value, 0);
      } else if (value && typeof value === "number") {
        data[key] = value.toString();
      }
    } catch (error) {
      continue;
    }
  }
  return { data, name: eventName };
};

export function eventDiscriminator(name: string) {
  return Buffer.from(sha256.digest(`event:${name}`)).subarray(0, 8);
}
