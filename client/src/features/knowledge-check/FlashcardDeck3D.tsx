import { useEffect, useState, useRef, useTransition } from "react";
import { vaultCards } from "./module-one-data";
import { playFlip, playCorrect, playWrong, playCombo, playLevelUp } from "./audio";
import { triggerConfetti } from "./confetti";
import { awardXp, recordStreak, unlockAchievement } from "./gamification";
import type { GameRecord } from "./ModuleOneArcade";

interface Props {
  record: GameRecord;
  save: (next: GameRecord) => void;
  userId: string;
}

export function FlashcardDeck3D({ record, save, userId }: Props) {
  const [, startTransition] = useTransition();
  const [flipped, setFlipped] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [combo, setCombo] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [cardOrder, setCardOrder] = useState<number[]>(() => {
    return Array.from({ length: vaultCards.length }, (_, i) => i);
  });
  const cardRef = useRef<HTMLDivElement>(null);

  const currentIndex = Math.min(record.cardIndex, cardOrder.length - 1);
  const currentCardIdx = cardOrder[currentIndex] ?? 0;
  const card = vaultCards[currentCardIdx]!;

  const ratedCount = Object.keys(record.ratings).length;
  const masteredCount = Object.values(record.ratings).filter(
    (r) => r === "Good" || r === "Easy",
  ).length;
  const isComplete = ratedCount >= vaultCards.length;

  // 3D Card Tilt on Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x: x * 18, y: -y * 18 });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  // Flip card
  const toggleFlip = () => {
    setFlipped(!flipped);
    playFlip();
  };

  // Rate card (Again, Hard, Good, Easy)
  const rateCard = (rating: "Again" | "Hard" | "Good" | "Easy") => {
    const isGood = rating === "Good" || rating === "Easy";
    const direction = isGood ? "right" : "left";
    setSwipeDirection(direction);

    // Audio & Combo
    if (isGood) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      if (nextCombo >= 3) {
        playCombo(nextCombo);
      } else {
        playCorrect();
      }
      awardXp(userId, rating === "Easy" ? 25 : 15, `Vault Card: ${rating}`);
      recordStreak(userId, true);
    } else {
      setCombo(0);
      playWrong();
      awardXp(userId, 5, "Vault Card: Reviewed");
      recordStreak(userId, false);
    }

    // Check achievement
    if (ratedCount + 1 >= 12) {
      const { unlocked } = unlockAchievement(userId, "vault_veteran");
      if (unlocked) {
        triggerConfetti(0.5, 0.4, 60);
        playLevelUp();
      }
    }

    // Save rating & advance
    setTimeout(() => {
      startTransition(() => {
        const nextRatings = { ...record.ratings, [String(currentCardIdx)]: rating };
        const nextDone = Object.keys(nextRatings).length >= vaultCards.length;
        if (nextDone && !record.completed) {
          triggerConfetti(0.5, 0.5, 100);
          playLevelUp();
        }

        save({
          ...record,
          ratings: nextRatings,
          completed: nextDone,
          best: Math.max(record.best, Object.keys(nextRatings).length),
          cardIndex: Math.min(currentIndex + 1, cardOrder.length - 1),
        });

        setFlipped(false);
        setSwipeDirection(null);
      });
    }, 280);
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp") {
        e.preventDefault();
        toggleFlip();
      } else if (flipped) {
        if (e.key === "1") rateCard("Again");
        if (e.key === "2") rateCard("Hard");
        if (e.key === "3") rateCard("Good");
        if (e.key === "4") rateCard("Easy");
      }
      if (e.key === "ArrowLeft" && currentIndex > 0) {
        setFlipped(false);
        save({ ...record, cardIndex: currentIndex - 1 });
      } else if (e.key === "ArrowRight" && currentIndex < cardOrder.length - 1) {
        setFlipped(false);
        save({ ...record, cardIndex: currentIndex + 1 });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flipped, currentIndex, cardOrder, record, combo]);

  const shuffleDeck = () => {
    playFlip();
    const shuffled = [...cardOrder].sort(() => Math.random() - 0.5);
    setCardOrder(shuffled);
    save({ ...record, cardIndex: 0 });
    setFlipped(false);
  };

  const restartDeck = () => {
    playFlip();
    save({ ...record, cardIndex: 0, ratings: {} });
    setFlipped(false);
    setCombo(0);
  };

  return (
    <div className="arc-3d-vault">
      {/* Top Gamified Metrics Bar */}
      <div className="arc-vault-stats-bar">
        <div className="arc-vault-stat">
          <span className="arc-stat-label">Progress</span>
          <span className="arc-stat-value">
            {ratedCount} / {vaultCards.length}
          </span>
        </div>
        <div className="arc-vault-stat">
          <span className="arc-stat-label">Mastered</span>
          <span className="arc-stat-value is-mastered">
            {masteredCount} ({Math.round((masteredCount / vaultCards.length) * 100)}%)
          </span>
        </div>
        {combo >= 2 && (
          <div className="arc-vault-combo-pill" role="status">
            <span>🔥 {combo} IN A ROW!</span>
          </div>
        )}
        <div className="arc-vault-deck-actions">
          <button
            type="button"
            className="arc-icon-button"
            onClick={shuffleDeck}
            title="Shuffle Deck"
          >
            🔀 Shuffle
          </button>
          <button
            type="button"
            className="arc-icon-button"
            onClick={restartDeck}
            title="Restart Practice"
          >
            🔄 Restart
          </button>
        </div>
      </div>

      {/* Progress Track */}
      <div
        className="arc-progress"
        aria-label={`Card progress: ${ratedCount} of ${vaultCards.length}`}
      >
        <span style={{ width: `${(ratedCount / vaultCards.length) * 100}%` }} />
      </div>

      {/* 3D Stack Stage */}
      <div className="arc-3d-stage">
        {/* Decorative Background Stack Cards for 3D Depth */}
        <div className="arc-stack-underlay underlay-2" />
        <div className="arc-stack-underlay underlay-1" />

        {/* The Active 3D Flipping Card */}
        <div
          ref={cardRef}
          className={`arc-3d-card-wrapper ${swipeDirection ? `swipe-${swipeDirection}` : ""}`}
          style={{
            transform: `perspective(1200px) rotateY(${flipped ? 180 : 0}deg) rotateX(${mousePos.y}deg) rotateZ(${mousePos.x * 0.15}deg)`,
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={toggleFlip}
          role="button"
          tabIndex={0}
          aria-label={
            flipped
              ? `Answer: ${card[1]}. Click to flip back.`
              : `Question: ${card[0]}. Click to reveal answer.`
          }
        >
          {/* Card Front (Question) */}
          <div className="arc-3d-card-face arc-card-front">
            <div className="arc-card-meta">
              <span className="arc-card-chip">QUESTION #{currentIndex + 1}</span>
              <span className="arc-card-slide">Module 1 · Slide {card[2]}</span>
            </div>
            <div className="arc-card-body">
              <h3>{card[0]}</h3>
            </div>
            <div className="arc-card-foot">
              <span className="arc-card-hint">
                <span className="arc-tap-icon">👆</span> Tap or press <kbd>Space</kbd> to flip
              </span>
              <span className="arc-card-status">
                {record.ratings[String(currentCardIdx)]
                  ? `Previously rated: ${record.ratings[String(currentCardIdx)]}`
                  : "Unrated"}
              </span>
            </div>
            <div className="arc-card-glare" />
          </div>

          {/* Card Back (Answer) */}
          <div className="arc-3d-card-face arc-card-back">
            <div className="arc-card-meta">
              <span className="arc-card-chip is-answer">ANSWER & KEY CONCEPT</span>
              <span className="arc-card-slide">Slide {card[2]}</span>
            </div>
            <div className="arc-card-body">
              <p className="arc-card-answer-text">{card[1]}</p>
            </div>
            <div className="arc-card-foot">
              <span className="arc-card-hint">Rate recall below to advance</span>
            </div>
            <div className="arc-card-glare is-back" />
          </div>
        </div>
      </div>

      {/* Animated SRS Confidence Rating Buttons (visible when flipped) */}
      <div className={`arc-srs-rating-container ${flipped ? "is-visible" : ""}`}>
        <p className="arc-srs-label">How well did you recall this answer?</p>
        <div
          className="arc-srs-button-row"
          role="group"
          aria-label="Spaced repetition recall ratings"
        >
          <button
            type="button"
            className="arc-srs-btn btn-again"
            onClick={(e) => {
              e.stopPropagation();
              rateCard("Again");
            }}
          >
            <span className="srs-key">1</span>
            <strong>Again</strong>
            <small>&lt; 1 min</small>
          </button>
          <button
            type="button"
            className="arc-srs-btn btn-hard"
            onClick={(e) => {
              e.stopPropagation();
              rateCard("Hard");
            }}
          >
            <span className="srs-key">2</span>
            <strong>Hard</strong>
            <small>10 min</small>
          </button>
          <button
            type="button"
            className="arc-srs-btn btn-good"
            onClick={(e) => {
              e.stopPropagation();
              rateCard("Good");
            }}
          >
            <span className="srs-key">3</span>
            <strong>Good</strong>
            <small>1 day</small>
          </button>
          <button
            type="button"
            className="arc-srs-btn btn-easy"
            onClick={(e) => {
              e.stopPropagation();
              rateCard("Easy");
            }}
          >
            <span className="srs-key">4</span>
            <strong>Easy</strong>
            <small>4 days</small>
          </button>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="arc-vault-nav-row">
        <button
          type="button"
          className="arc-nav-btn"
          disabled={currentIndex === 0}
          onClick={() => {
            setFlipped(false);
            save({ ...record, cardIndex: currentIndex - 1 });
          }}
        >
          ← Previous
        </button>
        <span className="arc-nav-indicator">
          {currentIndex + 1} of {cardOrder.length}
        </span>
        <button
          type="button"
          className="arc-nav-btn"
          disabled={currentIndex === cardOrder.length - 1}
          onClick={() => {
            setFlipped(false);
            save({ ...record, cardIndex: currentIndex + 1 });
          }}
        >
          Next →
        </button>
      </div>

      {/* Completion Banner */}
      {isComplete && (
        <div className="arc-vault-complete-card" role="status">
          <div className="arc-complete-icon">🏆</div>
          <div>
            <h3>Vault Deck Mastered!</h3>
            <p>
              You reviewed all {vaultCards.length} technical flashcards. {masteredCount} cards are
              in strong recall. Keep up the daily streak!
            </p>
          </div>
          <button type="button" className="arc-button" onClick={restartDeck}>
            Review Again
          </button>
        </div>
      )}
    </div>
  );
}
