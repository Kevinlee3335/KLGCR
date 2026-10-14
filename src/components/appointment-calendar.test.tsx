import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AppointmentCalendar } from "./appointment-calendar";
it("shows one grouped event in the month and all recipient names on selecting the day",()=>{
  const {container}=render(<AppointmentCalendar month="2026-10" items={[{id:"meeting",date:"2026-10-16",time:"16:30",label:"Operation Meeting",detail:"Meeting · 10 employees",expandedDetail:"Meeting · Kevin, Fikri, Nouril, Syafiqa, Faiz",href:null,tone:"calendar-meeting"}]} />);
  expect(container.querySelectorAll(".calendar-item")).toHaveLength(1);
  expect(screen.getByText("Meeting · 10 employees")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:/Show Friday, 16 October 2026/}));
  expect(screen.getByText("Meeting · Kevin, Fikri, Nouril, Syafiqa, Faiz")).toBeInTheDocument();
  expect(screen.getByText("1 item")).toBeInTheDocument();
});
