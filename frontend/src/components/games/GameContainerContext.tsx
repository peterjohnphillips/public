/**
 * Lets whatever is hosting a game decide what "Continue" means, without every
 * game mode having to know or pass it down.
 *
 * A game mode component renders GameSummary at the end but has no idea whether
 * it is one activity in the daily queue, a drill launched from a lesson page,
 * or a standalone visit - and those want three different destinations. The
 * container declares the intent; GameSummary reads it.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export interface GameContainerValue {
  /** Runs when the user presses Continue on the end-of-game summary. */
  onContinue: () => void;
  continueLabel: string;
}

const GameContainerContext = createContext<GameContainerValue | null>(null);

export function GameContainerProvider({
  value,
  children,
}: {
  value: GameContainerValue;
  children: ReactNode;
}) {
  return <GameContainerContext.Provider value={value}>{children}</GameContainerContext.Provider>;
}

/** Falls back to "go home" so a game rendered outside any provider still has a
 * working exit rather than a button that does nothing. */
export function useGameContainer(): GameContainerValue {
  const provided = useContext(GameContainerContext);
  const navigate = useNavigate();
  return provided ?? { onContinue: () => navigate("/"), continueLabel: "Done" };
}
