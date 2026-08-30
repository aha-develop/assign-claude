import React from "react";

export const RepositorySelect = ({
  repositories,
  value,
  onChange,
}: {
  repositories: string[];
  value: string;
  onChange: (repository: string) => void;
}) => (
  <span
    style={{
      alignItems: "center",
      display: "inline-flex",
      gap: "4px",
      marginLeft: "4px",
      verticalAlign: "baseline",
      whiteSpace: "nowrap",
    }}
  >
    <span>in</span>
    <span style={{ display: "inline-flex", position: "relative" }}>
      <select
        aria-label="Target GitHub repository"
        title="Select target GitHub repository"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          borderRadius: 0,
          color: "var(--theme-secondary-text)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "inherit",
          fontWeight: "inherit",
          lineHeight: "inherit",
          margin: 0,
          maxWidth: "240px",
          padding: "0 14px 0 0",
          width: "fit-content",
        }}
      >
        {repositories.map((repository) => (
          <option key={repository} value={repository}>
            {repository}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        style={{
          lineHeight: 1,
          pointerEvents: "none",
          position: "absolute",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
        }}
      >
        <i className="fa-solid fa-caret-down"></i>
      </span>
    </span>
  </span>
);
