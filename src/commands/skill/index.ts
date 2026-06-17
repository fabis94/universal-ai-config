import { defineCommand } from "citty";
import addCommand from "./add.js";

export default defineCommand({
  meta: {
    name: "skill",
    description: "Manage skill templates",
  },
  subCommands: {
    add: addCommand,
  },
});
