import { DecodedEvent } from "./event.js";
import { DecodedInstructionWithUsers } from "./instruction.js";

export type CombinedDecodedInstructionsAndEvents = {
  decodedInstructions: DecodedInstructionWithUsers[];
  decodedEvents: DecodedEvent[];
};
