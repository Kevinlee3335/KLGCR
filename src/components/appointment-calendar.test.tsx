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

it("limits compact cells to three, shows all five below, and filters by category without dropping records",()=>{
  const items=Array.from({length:5},(_,i)=>({id:`event-${i}`,date:"2026-10-16",time:"09:00",label:`Task ${i+1}`,detail:`Employee ${i+1}`,href:i===0?"/admin/jobs/job-1":null,kind:i===0?"maintenance" as const:"daily_task" as const}));
  const {container}=render(<AppointmentCalendar month="2026-10" items={items} compact />);
  expect(container.querySelectorAll(".calendar-item")).toHaveLength(3);
  expect(screen.getByRole("button",{name:/Show all 5 items/})).toHaveTextContent("+2 more");
  fireEvent.click(screen.getByRole("button",{name:/Show all 5 items/}));
  expect(container.querySelectorAll(".calendar-day-detail")).toHaveLength(5);
  expect(screen.getByRole("link",{name:/Task 1 Employee 1/})).toHaveAttribute("href","/admin/jobs/job-1");
  fireEvent.click(screen.getByRole("button",{name:"Daily Task"}));
  expect(screen.getByRole("button",{name:"Daily Task"})).toHaveAttribute("aria-pressed","true");
  expect(container.querySelectorAll(".calendar-item")).toHaveLength(3);
  expect(container.querySelectorAll(".calendar-day-detail")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button",{name:"All"}));
  expect(container.querySelectorAll(".calendar-day-detail")).toHaveLength(5);
});
