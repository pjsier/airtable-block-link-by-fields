import React from "react"

import {
  Box,
  Text,
  FormField,
  FieldPicker,
  SwitchSynced,
  TablePicker,
  ViewPickerSynced,
  colors,
} from "@airtable/blocks/ui"
import { FieldType } from "@airtable/blocks/models"

import { CONFIG } from "./constants"

const Controls = ({
  destTable,
  onChangeDestTable,
  joinField,
  onChangeJoinField,
  destFields,
  onChangeDestFields,
  sourceTable,
  sourceFields,
  onChangeSourceFields,
}) => (
  <Box minWidth={400}>
    <Box padding={3} paddingBottom={0} display="flex" flexDirection="column">
      <FormField label="Table">
        <TablePicker table={destTable} onChange={onChangeDestTable} />
      </FormField>
      {destTable && (
        <>
          <FormField label="View">
            <ViewPickerSynced
              table={destTable}
              globalConfigKey={CONFIG.DEST_VIEW_ID}
              shouldAllowPickingNone
              size="small"
            />
          </FormField>
          <FormField label="Linked record field">
            <FieldPicker
              table={destTable}
              field={joinField}
              allowedTypes={[FieldType.MULTIPLE_RECORD_LINKS]}
              onChange={onChangeJoinField}
              size="small"
            />
          </FormField>
        </>
      )}
      {destTable && sourceTable && (
        <Box borderTop="thick">
          <Box paddingTop={3}>
            <Text fontWeight="bold" textColor={colors.GRAY} paddingBottom={2}>
              Fields to match on
            </Text>
            <Text variant="paragraph">
              Records will be linked if the following fields in {destTable.name}{" "}
              and {sourceTable.name} have matching values.
            </Text>
          </Box>
          <Box display="flex" flexDirection="row">
            <Box paddingRight={1} style={{ flexGrow: "1", width: "50%" }}>
              <FormField label={`Field in ${destTable.name}`}>
                {destFields.map((field, idx) => (
                  <FieldPicker
                    key={idx}
                    table={destTable}
                    field={field}
                    onChange={(newField) => onChangeDestFields(newField, idx)}
                    shouldAllowPickingNone
                    size="small"
                    style={{ marginBottom: "4px" }}
                  />
                ))}
              </FormField>
            </Box>
            <Box paddingLeft={1} style={{ flexGrow: "1", width: "50%" }}>
              <FormField label={`Field in ${sourceTable.name}`}>
                {sourceTable &&
                  sourceFields.map((field, idx) => (
                    <FieldPicker
                      key={idx}
                      table={sourceTable}
                      field={field}
                      onChange={(newField) =>
                        onChangeSourceFields(newField, idx)
                      }
                      shouldAllowPickingNone
                      size="small"
                      style={{ marginBottom: "4px" }}
                    />
                  ))}
              </FormField>
            </Box>
          </Box>
          <Box>
            <Text fontWeight="500" textColor="light">
              Match settings
            </Text>
            <FormField label="" style={{ marginBottom: "2px" }}>
              <SwitchSynced
                globalConfigKey={CONFIG.JOIN_ON_ALL}
                label="Only update records where all fields match"
              />
            </FormField>
            <FormField label="" style={{ marginBottom: "2px" }}>
              <SwitchSynced
                globalConfigKey={CONFIG.CASE_SENSITIVE}
                label="Matching values should be case-sensitive"
                width={"100%"}
              />
            </FormField>
            <FormField label="" style={{ marginBottom: "2px" }}>
              <SwitchSynced
                globalConfigKey={CONFIG.OVERWRITE_EXISTING}
                label="Overwrite existing links with new matches"
              />
            </FormField>
          </Box>
        </Box>
      )}
    </Box>
  </Box>
)

export default Controls
