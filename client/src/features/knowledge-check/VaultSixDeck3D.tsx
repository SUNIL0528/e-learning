import { useEffect, useState, useRef, useTransition } from "react";
import { moduleSixSeed } from "./module-six-data";
import { playFlip, playCorrect, playWrong, playCombo, playLevelUp } from "./audio";
import { triggerConfetti } from "./confetti";
import { awardXp, recordStreak, unlockAchievement } from "./gamification";
import type { PracticeRecord } from "./module-six-progress";

type VaultRating = "Again" | "Hard" | "Good" | "Easy";

function nextDueDate(rating: VaultRating, now = new Date()) {
  const days = { Again: 0, Hard: 1, Good: 3, Easy: 7 }[rating];
  return new Date(now.getTime() + (days ? days * 86400000 : 60000)).toISOString();
}

interface Props {
  record: PracticeRecord;
  update: (change: Partial<PracticeRecord>) => void;
  userId: string;
}

export function VaultSixDeck3D({ record, update, userId }: Props) {
  const [, startTransition] = useTransition();
  const cards = moduleSixSeed.flashcards;
  const bookmarkKey = `hts-m6-vault-bookmarks:${userId}`;

  const decks = ["All", ...new Set(cards.map((c) => c.deck))];
  const [deck, setDeck] = useState("All");
  const [weakOnly, setWeakOnly] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [combo, setCombo] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(bookmarkKey) ?? "[]");
    } catch {
      return [];
    }
  });

  const cardRef = useRef<HTMLDivElement>(null);

  const filteredCards = cards.filter(
    (card) =>
      (deck === "All" || card.deck === deck) &&
      (!weakOnly ||
        !record.ratings[card.id] ||
        ["Again", "Hard"].includes(record.ratings[card.id]!.rating)),
  );

  const safeIndex = Math.min(index, Math.max(0, filteredCards.length - 1));
  const card = filteredCards[safeIndex];
  const ratedCount = Object.keys(record.ratings).length;
  const masteredCount = Object.values(record.ratings).filter(
    (r) => r.rating === "Good" || r.rating === "Easy",
  ).length;

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

  const toggleFlip = () => {
    setFlipped(!flipped);
    playFlip();
  };

  const rateCard = (rating: VaultRating) => {
    if (!card) return;
    const isGood = rating === "Good" || rating === "Easy";
    setSwipeDirection(isGood ? "right" : "left");

    if (isGood) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      if (nextCombo >= 3) {
        playCombo(nextCombo);
      } else {
        playCorrect();
      }
      awardXp(userId, rating === "Easy" ? 25 : 15, `Chapter 6 Vault: ${rating}`);
      recordStreak(userId, true);
    } else {
      setCombo(0);
      playWrong();
      awardXp(userId, 5, "Chapter 6 Vault: Review");
      recordStreak(userId, false);
    }

    if (ratedCount + 1 >= 20) {
      const { unlocked } = unlockAchievement(userId, "c6_vault_master");
      if (unlocked) {
        triggerConfetti(0.5, 0.4, 60);
        playLevelUp();
      }
    }

    setTimeout(() => {
      startTransition(() => {
        const ratings = {
          ...record.ratings,
          [card.id]: { rating, due: nextDueDate(rating) },
        };
        const allDone = Object.keys(ratings).length >= cards.length;
        if (allDone && !record.completed) {
          triggerConfetti(0.5, 0.5, 100);
          playLevelUp();
        }

        update({
          ratings,
          completed: allDone,
        });

        setFlipped(false);
        setSwipeDirection(null);
        setIndex((safeIndex + 1) % filteredCards.length);
      });
    }, 280);
  };

  const toggleBookmark = (cardId: string) => {
    playClick();
    const next = bookmarks.includes(cardId)
      ? bookmarks.filter((id) => id !== cardId)
      : [...bookmarks, cardId];
    setBookmarks(next);
    localStorage.setItem(bookmarkKey, JSON.stringify(next));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp") {
        e.preventDefault();
        toggleFlip();
      } else if (flipped) {
        if (e.key === "1") rateCard("Again");
        if (e.key === "2") rateCard("Hard");
        if (e.key === "3") rateCard("Good");
        if (e.key === "4") rateCard("Easy");
      }
      if (e.key === "ArrowLeft" && safeIndex > 0) {
        setFlipped(false);
        setIndex(safeIndex - 1);
      } else if (e.key === "ArrowRight" && safeIndex < filteredCards.length - 1) {
        setFlipped(false);
        setIndex(safeIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flipped, safeIndex, filteredCards, combo]);

  return (
    <div className="arc-3d-vault">
      {/* Top Controls & Category Filters */}
      <div className="arc-vault-stats-bar">
        <div className="arc-vault-stat">
          <span className="arc-stat-label">Chapter 6 Progress</span>
          <span className="arc-stat-value">
            {ratedCount} / {cards.length}
          </span>
        </div>

        <div className="arc-vault-stat">
          <span className="arc-stat-label">Mastered</span>
          <span className="arc-stat-value is-mastered">
            {masteredCount} ({Math.round((masteredCount / cards.length) * 100)}%)
          </span>
        </div>

        {combo >= 2 && (
          <div className="arc-vault-combo-pill" role="status">
            <span>🔥 {combo} IN A ROW!</span>
          </div>
        )}

        <div className="arc-vault-deck-actions">
          <select
            value={deck}
            onChange={(e) => {
              setDeck(e.target.value);
              setIndex(0);
              setFlipped(false);
            }}
            className="arc-deck-select"
          >
            {decks.map((d) => (
              <option key={d} value={d}>
                {d === "All" ? "All Decks (56)" : d}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`arc-icon-button ${weakOnly ? "is-active" : ""}`}
            onClick={() => {
              setWeakOnly(!weakOnly);
              setIndex(0);
            }}
          >
            {weakOnly ? "★ Needs Review" : "☆ Weak Cards"}
          </button>
        </div>
      </div>

      {/* Progress Track */}
      <div className="arc-progress" aria-label={`Card progress: ${ratedCount} of ${cards.length}`}>
        <span style={{ width: `${(ratedCount / cards.length) * 100}%` }} />
      </div>

      {/* 3D Stack Stage */}
      {card ? (
        <div className="arc-3d-stage">
          <div className="arc-stack-underlay underlay-2" />
          <div className="arc-stack-underlay underlay-1" />

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
                ? `Answer: ${card.back}. Click to flip back.`
                : `Question: ${card.front}. Click to reveal answer.`
            }
          >
            {/* Front */}
            <div className="arc-3d-card-face arc-card-front">
              <div className="arc-card-meta">
                <span className="arc-card-chip">{card.deck}</span>
                <span className="arc-card-slide">
                  Card {safeIndex + 1}/{filteredCards.length}
                </span>
              </div>
              <div className="arc-card-body">
                <h3>{card.front}</h3>
              </div>
              <div className="arc-card-foot">
                <span className="arc-card-hint">
                  <span className="arc-tap-icon">👆</span> Tap or press <kbd>Space</kbd> to flip
                </span>
                <button
                  type="button"
                  className="arc-bookmark-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBookmark(card.id);
                  }}
                >
                  {bookmarks.includes(card.id) ? "★ Bookmarked" : "☆ Bookmark"}
                </button>
              </div>
              <div className="arc-card-glare" />
            </div>

            {/* Back */}
            <div className="arc-3d-card-face arc-card-back">
              <div className="arc-card-meta">
                <span className="arc-card-chip is-answer">ANSWER & EXPLANATION</span>
                <span className="arc-card-slide">S{card.sourceSlides.join(", S")}</span>
              </div>
              <div className="arc-card-body">
                <p className="arc-card-answer-text">{card.back}</p>
              </div>
              <div className="arc-card-foot">
                <span className="arc-card-hint">Rate recall below to schedule next review</span>
              </div>
              <div className="arc-card-glare is-back" />
            </div>
          </div>
        </div>
      ) : (
        <div className="arc-empty-deck">
          No cards found for this filter. Try selecting "All Decks".
        </div>
      )}

      {/* SRS Rating Buttons */}
      <div className={`arc-srs-rating-container ${flipped ? "is-visible" : ""}`}>
        <p className="arc-srs-label">How well did you recall this answer?</p>
        <div className="arc-srs-button-row" role="group" aria-label="Spaced repetition recall ratings">
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
            <small>1 day</small>
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
            <small>3 days</small>
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
            <small>7 days</small>
          </button>
        </div>
      </div>

      {/* Nav Controls */}
      <div className="arc-vault-nav-row">
        <button
          type="button"
          className="arc-nav-btn"
          disabled={safeIndex === 0}
          onClick={() => {
            setFlipped(false);
            setIndex(safeIndex - 1);
          }}
        >
          ← Previous
        </button>
        <span className="arc-nav-indicator">
          {safeIndex + 1} of {filteredCards.length}
        </span>
        <button
          type="button"
          className="arc-nav-btn"
          disabled={safeIndex === filteredCards.length - 1}
          onClick={() => {
            setFlipped(false);
            setIndex(safeIndex + 1);
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
