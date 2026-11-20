"use client";
import { useId } from "react";
export function SectionTitle({ title, help }: { title: string; help: string }) {
  const id = useId();
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <button
        className="info-button"
        type="button"
        popoverTarget={id}
        aria-label={`About ${title}`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="10"
            cy="10"
            r="7.5"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M10 9v5M10 6v.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div id={id} popover="auto" className="info-popover">
        <strong>{title}</strong>
        <p>{help}</p>
        <button type="button" popoverTarget={id} popoverTargetAction="hide">
          Close
        </button>
      </div>
    </div>
  );
}
