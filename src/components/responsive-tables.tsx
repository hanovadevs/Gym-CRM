"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type TableHTMLAttributes,
} from "react";
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: ReactNode }>(node))
    return text(node.props.children);
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? text(child.props.children)
        : String(child ?? ""),
    )
    .join(" ");
}
/** Render labels with the table, so streamed rows and hydration stay consistent. */
export function ResponsiveTable({
  children,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  const labels: string[] = [];
  function collect(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return;
      if (child.type === "th") labels.push(text(child.props.children).trim());
      else collect(child.props.children);
    });
  }
  collect(children);
  function decorate(node: ReactNode): ReactNode {
    return Children.map(node, (child) => {
      if (!isValidElement<Record<string, unknown>>(child)) return child;
      if (child.type === "tr") {
        let column = 0;
        return cloneElement(
          child,
          {},
          Children.map(child.props.children as ReactNode, (cell) => {
            if (
              !isValidElement<Record<string, unknown>>(cell) ||
              cell.type !== "td"
            )
              return cell;
            const span = Number(cell.props.colSpan ?? 1),
              label = span > 1 ? "" : labels[column] || "";
            column += span;
            return cloneElement(cell, {
              "data-label": label,
              "data-full-width": span > 1 ? "true" : undefined,
            });
          }),
        );
      }
      return cloneElement(
        child,
        {},
        decorate(child.props.children as ReactNode),
      );
    });
  }
  return <table {...props}>{decorate(children)}</table>;
}
