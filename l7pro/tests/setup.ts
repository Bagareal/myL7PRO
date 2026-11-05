// Su questo PC la suite a volte rallenta: le attese dei test (findBy, waitFor) valgono 5 secondi invece di 1.
import { configure } from "@testing-library/dom";

configure({ asyncUtilTimeout: 5000 });
