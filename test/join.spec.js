import test from "ava"
import { stub } from "sinon"
import { createJoinKeys, createJoinKeyMap } from "../frontend/join"

test("creates correct join keys", (t) => {
  const cellValueStub = stub()
  cellValueStub.withArgs("1").returns("TEST")
  cellValueStub.withArgs("2").returns("test2")
  cellValueStub.withArgs("3").returns("")

  t.deepEqual(
    createJoinKeys(
      { getCellValueAsString: cellValueStub },
      ["1", "2", "3"],
      false,
      false
    ),
    ["test", "test2"]
  )

  t.deepEqual(
    createJoinKeys(
      { getCellValueAsString: cellValueStub },
      ["1", "2", "3"],
      true,
      true
    ),
    ["TEST,test2,"]
  )
})

test("creates correct join key map", (t) => {
  const stubOne = stub()
  stubOne.withArgs("1").returns("TEST")
  stubOne.withArgs("2").returns("test2")
  const stubTwo = stub()
  stubTwo.withArgs("1").returns("test")
  stubTwo.withArgs("2").returns("test3")

  const records = [
    { getCellValueAsString: stubOne },
    { getCellValueAsString: stubTwo },
  ]

  t.deepEqual(createJoinKeyMap(records, ["1", "2"], true, false), {
    TEST: records[0],
    test2: records[0],
    test: records[1],
    test3: records[1],
  })
})
