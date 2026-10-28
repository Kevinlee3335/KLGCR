import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {afterEach,it,expect} from "vitest";
import {CheckoutDefectPicker} from "./checkout-defect-picker";
afterEach(cleanup);
it("submits an explicit No Defect choice without requiring hidden repair fields",()=>{
 const {container}=render(<CheckoutDefectPicker name="checkoutDefects" required/>);
 fireEvent.click(screen.getByRole("checkbox",{name:/No Defect/}));
 expect(screen.queryByRole("combobox")).toBeNull();
 expect(container.querySelector('input[name="checkoutDefects"]')).toHaveValue('[{"description":"No Defect"}]');
 fireEvent.click(screen.getByRole("checkbox",{name:/No Defect/}));
 expect(screen.getAllByRole("combobox")).toHaveLength(3);
});
