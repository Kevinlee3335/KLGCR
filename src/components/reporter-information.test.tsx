import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReporterInformation } from "./reporter-information";

describe("ReporterInformation", () => {
  it("formats and displays complaint availability", () => {
    render(<ReporterInformation availabilityDate="2026-09-10" availabilityTime="10:30:00 - 11:30:00" roomAccessPermission="yes"/>);
    expect(screen.getByText("10 Sep 2026")).toBeInTheDocument();
    expect(screen.getByText("10:30 AM - 11:30 AM")).toBeInTheDocument();
    expect(screen.getByText("YES")).toBeInTheDocument();
  });

  it("hides unavailable values", () => {
    render(<ReporterInformation availabilityDate={null} availabilityTime={null} roomAccessPermission={null}/>);
    expect(screen.queryByText("Availability Date")).not.toBeInTheDocument();
    expect(screen.queryByText("Availability Time")).not.toBeInTheDocument();
    expect(screen.queryByText("Room Access Permission")).not.toBeInTheDocument();
  });
});
