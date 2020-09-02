export const createJoinKeys = (record, fieldIds, caseSensitive, joinOnAll) => {
  const getJoinKeys = (rec) =>
    fieldIds
      .filter((fieldId) => fieldId !== null)
      .map((fieldId) => {
        const val = rec.getCellValueAsString(fieldId)
        return caseSensitive ? val : val.toLowerCase()
      })

  const joinKeys = getJoinKeys(record)
  const validKeys = joinKeys.filter((value) => value.length > 0)
  return joinOnAll ? [joinKeys.join(",")] : validKeys
}

// Create a mapping of join key values to record IDs
export const createJoinKeyMap = (records, fieldIds, caseSensitive, joinOnAll) =>
  records
    .map((record) =>
      createJoinKeys(record, fieldIds, caseSensitive, joinOnAll).map((key) => ({
        key,
        record,
      }))
    )
    .flat()
    .filter(({ key }) => key.length > 0)
    .reduce(
      (obj, { record, key }) => ({
        ...obj,
        [key]: record,
      }),
      {}
    )
