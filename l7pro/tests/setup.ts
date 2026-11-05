// On this PC the suite sometimes slows down: test waits (findBy, waitFor) last 5 seconds instead of 1.
import { configure } from "@testing-library/dom";

configure({ asyncUtilTimeout: 5000 });
