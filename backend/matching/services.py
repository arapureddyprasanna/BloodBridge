from math import asin, cos, radians, sin, sqrt

from django.utils import timezone

from accounts.models import VerificationApplication
from communities.models import DonorCommunityApplication
from donors.models import DonorProfile
from hospitals.models import HospitalProfile


# ---------------------------------------------------------------------------
# Blood compatibility
# ---------------------------------------------------------------------------

# Recipient blood group -> donor blood groups that can provide whole blood.
DONOR_COMPATIBILITY = {
    "O-": {"O-"},
    "O+": {"O-", "O+"},
    "A-": {"O-", "A-"},
    "A+": {"O-", "O+", "A-", "A+"},
    "B-": {"O-", "B-"},
    "B+": {"O-", "O+", "B-", "B+"},
    "AB-": {"O-", "A-", "B-", "AB-"},
    "AB+": {
        "O-",
        "O+",
        "A-",
        "A+",
        "B-",
        "B+",
        "AB-",
        "AB+",
    },
}


# ---------------------------------------------------------------------------
# Distance
# ---------------------------------------------------------------------------

def calculate_distance_km(
    latitude_1,
    longitude_1,
    latitude_2,
    longitude_2,
):
    """
    Calculate the great-circle distance between two coordinates
    using the Haversine formula.
    """

    if None in (
        latitude_1,
        longitude_1,
        latitude_2,
        longitude_2,
    ):
        return None

    latitude_1 = radians(float(latitude_1))
    longitude_1 = radians(float(longitude_1))
    latitude_2 = radians(float(latitude_2))
    longitude_2 = radians(float(longitude_2))

    delta_latitude = latitude_2 - latitude_1
    delta_longitude = longitude_2 - longitude_1

    a = (
        sin(delta_latitude / 2) ** 2
        + cos(latitude_1)
        * cos(latitude_2)
        * sin(delta_longitude / 2) ** 2
    )

    c = 2 * asin(sqrt(a))

    # Earth's average radius in kilometres.
    earth_radius_km = 6371.0

    return earth_radius_km * c


# ---------------------------------------------------------------------------
# Blood compatibility
# ---------------------------------------------------------------------------

def is_blood_compatible(donor_blood_group, recipient_blood_group):
    """
    Return True when the donor's blood group is compatible
    with the recipient's requested blood group.
    """

    compatible_donors = DONOR_COMPATIBILITY.get(
        recipient_blood_group,
        set(),
    )

    return donor_blood_group in compatible_donors


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

def is_donor_available(donor_profile):
    """
    Check the donor's current availability window.
    """

    if not donor_profile.is_available:
        return False

    today = timezone.localdate()

    if (
        donor_profile.availability_start
        and today < donor_profile.availability_start
    ):
        return False

    if (
        donor_profile.availability_end
        and today > donor_profile.availability_end
    ):
        return False

    return True


# ---------------------------------------------------------------------------
# Location
# ---------------------------------------------------------------------------

def has_location(profile):
    """
    Check whether a profile has both latitude and longitude.
    """

    return (
        profile.latitude is not None
        and profile.longitude is not None
    )


# ---------------------------------------------------------------------------
# Individual donor matching
# ---------------------------------------------------------------------------

def get_donor_distance_for_request(blood_request, donor_profile):
    """
    Calculate the distance between the hospital handling the request
    and the donor.
    """

    try:
        hospital_profile = blood_request.hospital.hospital_profile
    except HospitalProfile.DoesNotExist:
        return None

    if not has_location(hospital_profile):
        return None

    if not has_location(donor_profile):
        return None

    return calculate_distance_km(
        hospital_profile.latitude,
        hospital_profile.longitude,
        donor_profile.latitude,
        donor_profile.longitude,
    )


def is_donor_eligible_for_request(
    blood_request,
    donor_profile,
    require_location=True,
):
    """
    Determine whether a donor can be considered for a blood request.

    This performs the core matching checks:
    - donor account is active
    - donor has the donor role
    - donor has opted into matching
    - donor is currently available
    - blood groups are compatible
    - donor has location when required
    - donor is within their configured travel radius
    """

    donor = donor_profile.user

    if donor.role != "donor":
        return False

    if donor.account_status != "active":
        return False

    if not donor.is_active:
        return False

    if not donor_profile.allow_verified_hospital_matching:
        return False

    # Donors enter the active donor pool only after their community
    # membership and required documents have been approved. Keep matching
    # aligned with that onboarding gate, including when an admin later
    # disables or loses approval for the community.
    if not DonorCommunityApplication.objects.filter(
        donor=donor,
        status=DonorCommunityApplication.Status.ACCEPTED,
        community__is_active=True,
        community__admin__account_status="active",
        community__admin__is_active=True,
        community__admin__verification_application__status=(
            VerificationApplication.Status.APPROVED
        ),
    ).exists():
        return False

    if not is_donor_available(donor_profile):
        return False

    if not is_blood_compatible(
        donor_profile.blood_group,
        blood_request.blood_group,
    ):
        return False

    distance_km = get_donor_distance_for_request(
        blood_request,
        donor_profile,
    )

    if distance_km is None:
        return not require_location

    if (
        donor_profile.max_travel_distance_km is not None
        and distance_km > donor_profile.max_travel_distance_km
    ):
        return False

    return True


# ---------------------------------------------------------------------------
# Matching engine
# ---------------------------------------------------------------------------

def find_matching_donors(
    blood_request,
    require_location=True,
):
    """
    Return eligible donors for a blood request.

    Results are ordered by:
    1. Distance when location is available.
    2. Donor profile creation time as a stable fallback.

    The function does NOT create invitations.
    Hospital selection is handled separately.
    """

    donor_profiles = (
        DonorProfile.objects
        .select_related("user")
        .filter(
            user__role="donor",
            user__account_status="active",
            user__is_active=True,
            allow_verified_hospital_matching=True,
            is_available=True,
            user__community_applications__status=(
                DonorCommunityApplication.Status.ACCEPTED
            ),
            user__community_applications__community__is_active=True,
            user__community_applications__community__admin__account_status="active",
            user__community_applications__community__admin__is_active=True,
            user__community_applications__community__admin__verification_application__status=(
                VerificationApplication.Status.APPROVED
            ),
        )
        .distinct()
    )

    matches = []

    for donor_profile in donor_profiles:
        if not is_donor_eligible_for_request(
            blood_request,
            donor_profile,
            require_location=require_location,
        ):
            continue

        distance_km = get_donor_distance_for_request(
            blood_request,
            donor_profile,
        )

        matches.append(
            {
                "donor": donor_profile.user,
                "donor_profile": donor_profile,
                "distance_km": distance_km,
                "blood_group": donor_profile.blood_group,
            }
        )

    matches.sort(
        key=lambda match: (
            float("inf")
            if match["distance_km"] is None
            else match["distance_km"],
            match["donor_profile"].created_at,
        )
    )

    return matches
