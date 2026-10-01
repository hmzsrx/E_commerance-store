from pydantic import BaseModel, ConfigDict, Field


class StoreBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)


class StoreCreate(StoreBase):
    pass


class StoreOut(StoreBase):
    id: int
    owner_id: int

    model_config = ConfigDict(from_attributes=True)
