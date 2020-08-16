import React from "react"
import { FixedSizeList as List } from "react-window"
import AutoSizer from "react-virtualized-auto-sizer"

import { Box, Icon, CellRenderer, colors } from "@airtable/blocks/ui"

import { GRID_SIZE, ROW_HEIGHT } from "./constants"
import FieldLabel from "./field-label"

const Preview = ({ recordLinks, destFields, joinField, overwriteExisting }) => (
  <AutoSizer>
    {({ height, width }) => (
      <List
        width={width}
        height={height - GRID_SIZE * 16}
        itemCount={recordLinks.length}
        itemSize={ROW_HEIGHT}
      >
        {({ index, style }) => {
          const { record, match } = recordLinks[index]
          return (
            <Box
              key={record.id}
              display="flex"
              flexDirection="row"
              alignItems="center"
              style={style}
              borderBottom="thick"
              paddingTop={1}
            >
              <Box
                display="flex"
                flexDirection="column"
                style={{ maxWidth: "100%", minWidth: "100%" }}
              >
                <Box
                  fontSize="14px"
                  height="18px"
                  lineHeight={1.5}
                  display="flex"
                  alignItems="center"
                  marginBottom={3}
                >
                  {record.name}
                </Box>
                <Box
                  display="flex"
                  flexDirection="row"
                  alignItems="center"
                  style={{
                    maxWidth: "100%",
                    overflowX: "scroll",
                    overflowY: "hidden",
                  }}
                >
                  <Box marginRight={1}>
                    <FieldLabel name={joinField.name} />
                    <Box display="flex" flexDirection="row" alignItems="center">
                      <Icon name="plus" fillColor={colors.GREEN} />
                      <CellRenderer
                        field={joinField}
                        cellValue={[{ id: match.id, name: match.name }]}
                      />
                      {overwriteExisting && record.getCellValue(joinField.id) && (
                        <>
                          <Icon name="minus" fillColor={colors.RED} />
                          <CellRenderer
                            field={joinField}
                            cellValue={record.getCellValue(joinField.id)}
                          />
                        </>
                      )}
                    </Box>
                  </Box>
                  {destFields
                    .filter((field) => field !== null && !field.isPrimaryField)
                    .map((field) => (
                      <Box key={field.id} marginRight={1}>
                        <FieldLabel name={field.name} />
                        <CellRenderer field={field} record={record} />
                      </Box>
                    ))}
                </Box>
              </Box>
            </Box>
          )
        }}
      </List>
    )}
  </AutoSizer>
)

export default Preview
