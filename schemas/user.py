from pydantic import BaseModel, ConfigDict, EmailStr


class UserRoleBase(BaseModel):
    user_id: int
    role_id: int


class UserRoleCreate(UserRoleBase):
    pass


class UserRoleOut(UserRoleBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str | None = None


class UserCreate(UserBase):
    password: str


class UserRoleAssignment(BaseModel):
    role_id: int


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(UserBase):
    id: int
    is_active: bool = True
    role_id: int | None = None
    role_name: str | None = None

    model_config = ConfigDict(from_attributes=True)
