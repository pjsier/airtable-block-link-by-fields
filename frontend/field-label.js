import { Box } from "@airtable/blocks/ui"
import React from "react"

const FieldLabel = ({ name }) => (
  <Box
    fontSize="11px"
    lineHeight="13px"
    textColor="#898989"
    style={{
      textTransform: "uppercase",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }}
  >
    {name}
  </Box>
)

export default FieldLabel
